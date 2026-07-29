"""Studio SSO exchange + org/project space provisioning for Gameplan."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import frappe
from frappe import _

from indobase_discuss.utils.space_map import build_discuss_space_map, gameplan_space_path

AUDIENCE = "indobase-discuss"
ALLOWED_ROLES = frozenset({"owner", "admin", "developer", "viewer"})
GAMEPLAN_MEMBER = "Gameplan Member"
GAMEPLAN_GUEST = "Gameplan Guest"


def _handoff_secret() -> str:
	secret = (frappe.conf.get("discuss_handoff_secret") or frappe.conf.get("studio_handoff_secret") or "").strip()
	if len(secret) < 32:
		frappe.throw(_("Discuss SSO is not configured"), frappe.PermissionError)
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
		frappe.throw(_("Discuss access requires an organization role"), frappe.PermissionError)

	email = (payload.get("email") or "").strip().lower()
	project_ref = (payload.get("project_ref") or "").strip()
	org_slug = (payload.get("organization_slug") or "").strip()
	if not email or "@" not in email or not project_ref or not org_slug:
		frappe.throw(_("Handoff token missing required claims"), frappe.AuthenticationError)

	return payload


def _map_gameplan_role(studio_role: str) -> str:
	return GAMEPLAN_GUEST if studio_role == "viewer" else GAMEPLAN_MEMBER


def _ensure_user(email: str, full_name: str | None = None) -> str:
	if frappe.db.exists("User", email):
		return email

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": (full_name or email.split("@")[0])[:140],
			"enabled": 1,
			"send_welcome_email": 0,
			"user_type": "System User",
		}
	)
	user.insert(ignore_permissions=True)
	user.add_roles(_map_gameplan_role("developer"))
	return email


def _ensure_team(team_key: str, title: str, org_slug: str) -> str:
	existing = frappe.db.get_value("GP Team", {"indobase_team_key": team_key}, "name")
	if existing:
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "GP Team",
			"title": title,
			"indobase_team_key": team_key,
			"indobase_org_slug": org_slug,
			"is_private": 0,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_space(space_key: str, title: str, team: str, project_ref: str) -> str:
	existing = frappe.db.get_value("GP Project", {"indobase_space_key": space_key}, "name")
	if existing:
		doc = frappe.get_doc("GP Project", existing)
		if doc.team != team:
			doc.team = team
			doc.save(ignore_permissions=True)
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "GP Project",
			"title": title,
			"team": team,
			"indobase_space_key": space_key,
			"indobase_project_ref": project_ref,
			"is_private": 0,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_membership(user: str, team: str, space: str, studio_role: str) -> None:
	gp_role = _map_gameplan_role(studio_role)
	team_doc = frappe.get_doc("GP Team", team)
	if user not in [m.user for m in team_doc.members]:
		team_doc.append("members", {"user": user})
		team_doc.save(ignore_permissions=True)

	space_doc = frappe.get_doc("GP Project", space)
	if user not in [m.user for m in space_doc.members]:
		space_doc.append("members", {"user": user})
		space_doc.save(ignore_permissions=True)

	user_doc = frappe.get_doc("User", user)
	if gp_role not in frappe.get_roles(user):
		user_doc.add_roles(gp_role)


@frappe.whitelist(allow_guest=True)
def exchange(token: str | None = None) -> dict[str, str]:
	"""Verify Studio JWT, provision team/space, log user in, return redirect path."""
	if not token:
		frappe.throw(_("Missing handoff token"), frappe.AuthenticationError)

	claims = verify_studio_handoff(token)
	email = claims["email"].strip().lower()
	studio_role = claims["role"]
	space_map = build_discuss_space_map(
		org_slug=claims.get("organization_slug") or "",
		project_ref=claims.get("project_ref") or "",
		project_name=claims.get("project_name"),
		organization_name=claims.get("organization_name"),
	)

	user = _ensure_user(email)
	team = _ensure_team(space_map["team_key"], space_map["team_title"], space_map["org_slug"])
	space = _ensure_space(space_map["space_key"], space_map["space_title"], team, space_map["project_ref"])
	_ensure_membership(user, team, space, studio_role)

	frappe.local.login_manager.login_as(user)
	redirect = gameplan_space_path(team, space)
	return {
		"redirect": redirect,
		"email": email,
		"space_key": space_map["space_key"],
		"team": team,
		"space": space,
	}
