"""Studio SSO exchange + org/project workspace provisioning for Frappe Suite."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import frappe
from frappe import _

from indobase_suite.utils.workspace_map import build_workspace_map, workspace_home_path

AUDIENCE = "indobase-suite"
ALLOWED_ROLES = frozenset({"owner", "admin", "developer", "viewer"})
SUITE_USER = "Suite User"


def _handoff_secret() -> str:
	secret = (frappe.conf.get("suite_handoff_secret") or frappe.conf.get("studio_handoff_secret") or "").strip()
	if len(secret) < 32:
		frappe.throw(_("Workspace SSO is not configured"), frappe.PermissionError)
	return secret


def _b64url_decode(value: str) -> bytes:
	padded = value + "=" * (-len(value) % 4)
	return base64.b64decode(padded.replace("-", "+").replace("_", "/"))


def _verify_hs256(token: str, secret: str) -> dict[str, Any] | None:
	parts = token.split(".")
	if len(parts) != 3:
		return None
	header_b64, payload_b64, sig_b64 = parts
	signed = f"{header_b64}.{payload_b64}".encode()
	expected = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
	try:
		actual = _b64url_decode(sig_b64)
	except Exception:
		return None
	if not hmac.compare_digest(actual, expected):
		return None
	try:
		return json.loads(_b64url_decode(payload_b64))
	except Exception:
		return None


def verify_studio_handoff(token: str) -> dict[str, Any]:
	secret = _handoff_secret()
	payload = _verify_hs256(token.strip(), secret)
	if not payload:
		frappe.throw(_("Invalid or expired handoff token"), frappe.AuthenticationError)

	now = int(time.time())
	exp = int(payload.get("exp") or 0)
	if not exp or exp < now:
		frappe.throw(_("Handoff token expired"), frappe.AuthenticationError)
	if payload.get("aud") != AUDIENCE:
		frappe.throw(_("Invalid handoff audience"), frappe.AuthenticationError)

	role = payload.get("role")
	if role not in ALLOWED_ROLES:
		frappe.throw(_("Workspace access requires an organization role"), frappe.PermissionError)

	email = (payload.get("email") or "").strip().lower()
	project_ref = (payload.get("project_ref") or "").strip()
	org_slug = (payload.get("organization_slug") or "").strip()
	if not email or "@" not in email or not project_ref or not org_slug:
		frappe.throw(_("Handoff token missing required claims"), frappe.AuthenticationError)

	return payload


def _map_drive_access(studio_role: str) -> int:
	# Drive Team Member access: 0 = guest/read, 1 = member
	return 0 if studio_role == "viewer" else 1


def _ensure_user(email: str) -> str:
	if frappe.db.exists("User", email):
		return email

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0][:140],
			"enabled": 1,
			"send_welcome_email": 0,
			"user_type": "System User",
		}
	)
	user.insert(ignore_permissions=True)
	user.add_roles(SUITE_USER)
	return email


def _ensure_drive_team(team_key: str, title: str, org_slug: str) -> str:
	existing = frappe.db.get_value("Drive Team", {"indobase_team_key": team_key}, "name")
	if existing:
		return existing

	team = frappe.get_doc(
		{
			"doctype": "Drive Team",
			"title": title,
			"indobase_team_key": team_key,
			"indobase_org_slug": org_slug,
			"personal": 0,
		}
	)
	team.insert(ignore_permissions=True)
	return team.name


def _ensure_team_membership(user: str, team: str, studio_role: str) -> None:
	access = _map_drive_access(studio_role)
	team_doc = frappe.get_doc("Drive Team", team)
	member_emails = {row.user for row in team_doc.users}
	if user not in member_emails:
		team_doc.append("users", {"user": user, "access": access})
		team_doc.save(ignore_permissions=True)

	user_doc = frappe.get_doc("User", user)
	if SUITE_USER not in frappe.get_roles(user):
		user_doc.add_roles(SUITE_USER)

	if not frappe.db.exists("Drive Settings", {"user": user}):
		frappe.get_doc({"doctype": "Drive Settings", "user": user}).insert(ignore_permissions=True)

	try:
		settings = frappe.get_doc("Drive Settings", {"user": user})
		settings.recent_team = team
		settings.save(ignore_permissions=True)
	except Exception:
		pass


def _ensure_project_folder(team: str, project_key: str, title: str, project_ref: str) -> None:
	existing = frappe.db.get_value(
		"File",
		{"indobase_project_key": project_key, "team": team, "is_folder": 1},
		"name",
	)
	if existing:
		return

	folder = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": title,
			"is_folder": 1,
			"team": team,
			"indobase_project_key": project_key,
			"indobase_project_ref": project_ref,
		}
	)
	folder.insert(ignore_permissions=True)


@frappe.whitelist(allow_guest=True)
def exchange(token: str | None = None) -> dict[str, str]:
	"""Verify Studio JWT, provision workspace context, log user in, return redirect path."""
	if not token:
		frappe.throw(_("Missing handoff token"), frappe.AuthenticationError)

	claims = verify_studio_handoff(token)
	email = claims["email"].strip().lower()
	studio_role = claims["role"]
	workspace_map = build_workspace_map(
		org_slug=claims.get("organization_slug") or "",
		project_ref=claims.get("project_ref") or "",
		project_name=claims.get("project_name"),
		organization_name=claims.get("organization_name"),
	)

	user = _ensure_user(email)
	team = _ensure_drive_team(
		workspace_map["team_key"],
		workspace_map["team_title"],
		workspace_map["org_slug"],
	)
	_ensure_project_folder(
		team,
		workspace_map["project_key"],
		workspace_map["project_title"],
		workspace_map["project_ref"],
	)
	_ensure_team_membership(user, team, studio_role)

	frappe.local.login_manager.login_as(user)
	redirect = workspace_home_path(workspace_map)
	return {
		"redirect": redirect,
		"email": email,
		"drive_team": team,
		"project_key": workspace_map["project_key"],
	}
