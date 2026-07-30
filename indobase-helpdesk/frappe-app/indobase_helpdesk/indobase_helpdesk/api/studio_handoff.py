"""Studio SSO exchange + org/project team/queue provisioning for Helpdesk."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import frappe
from frappe import _

from indobase_helpdesk.utils.helpdesk_map import (
	build_helpdesk_scope_map,
	helpdesk_agent_path,
	helpdesk_portal_path,
)

AUDIENCE = "indobase-helpdesk"
ALLOWED_ROLES = frozenset({"owner", "admin", "developer", "viewer"})
HELPDESK_AGENT = "Agent"
HELPDESK_CUSTOMER = "Customer"


def _handoff_secret() -> str:
	secret = (
		frappe.conf.get("helpdesk_handoff_secret") or frappe.conf.get("studio_handoff_secret") or ""
	).strip()
	if len(secret) < 32:
		frappe.throw(_("Helpdesk SSO is not configured"), frappe.PermissionError)
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
		frappe.throw(_("Helpdesk access requires an organization role"), frappe.PermissionError)

	email = (payload.get("email") or "").strip().lower()
	project_ref = (payload.get("project_ref") or "").strip()
	org_slug = (payload.get("organization_slug") or "").strip()
	if not email or "@" not in email or not project_ref or not org_slug:
		frappe.throw(_("Handoff token missing required claims"), frappe.AuthenticationError)

	return payload


def _map_helpdesk_role(studio_role: str) -> str:
	return HELPDESK_CUSTOMER if studio_role == "viewer" else HELPDESK_AGENT


def _ensure_user(email: str, studio_role: str, full_name: str | None = None) -> str:
	if frappe.db.exists("User", email):
		return email

	is_agent = studio_role in {"owner", "admin", "developer"}
	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": (full_name or email.split("@")[0])[:140],
			"enabled": 1,
			"send_welcome_email": 0,
			"user_type": "System User" if is_agent else "Website User",
		}
	)
	user.insert(ignore_permissions=True)
	if is_agent:
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": email,
				"parenttype": "User",
				"parentfield": "roles",
				"role": HELPDESK_AGENT,
			}
		).insert(ignore_permissions=True)
	else:
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": email,
				"parenttype": "User",
				"parentfield": "roles",
				"role": HELPDESK_CUSTOMER,
			}
		).insert(ignore_permissions=True)
	return email


def _ensure_hd_team(team_key: str, title: str, org_slug: str, user: str) -> str | None:
	if not frappe.db.exists("DocType", "HD Team"):
		return None

	existing = frappe.db.get_value("HD Team", {"indobase_team_key": team_key}, "name")
	if existing:
		doc = frappe.get_doc("HD Team", existing)
		member_users = {row.user for row in doc.users}
		if user and user not in member_users:
			doc.append("users", {"user": user})
			doc.save(ignore_permissions=True)
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "HD Team",
			"team_name": title,
			"indobase_team_key": team_key,
			"indobase_org_slug": org_slug,
			"users": [{"user": user}],
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_queue_marker(queue_key: str, title: str, team_key: str, project_ref: str) -> None:
	frappe.db.set_default(
		f"indobase_helpdesk_queue_{queue_key}",
		json.dumps(
			{
				"queue_key": queue_key,
				"queue_title": title,
				"team_key": team_key,
				"project_ref": project_ref,
			}
		),
	)


def _ensure_membership(user: str, studio_role: str) -> None:
	hd_role = _map_helpdesk_role(studio_role)
	if hd_role in frappe.get_roles(user):
		return
	frappe.get_doc(
		{
			"doctype": "Has Role",
			"parent": user,
			"parenttype": "User",
			"parentfield": "roles",
			"role": hd_role,
		}
	).insert(ignore_permissions=True)


def _ensure_setup_complete() -> None:
	try:
		if not frappe.db.get_single_value("System Settings", "setup_complete"):
			frappe.db.set_single_value("System Settings", "setup_complete", 1)
			frappe.db.set_default("setup_complete", "1")
	except Exception:
		pass


@frappe.whitelist(allow_guest=True)
def exchange(token: str | None = None) -> dict[str, str]:
	"""Verify Studio JWT, provision team/queue scope, log user in, return redirect path."""
	if not token:
		frappe.throw(_("Missing handoff token"), frappe.AuthenticationError)

	claims = verify_studio_handoff(token)
	email = claims["email"].strip().lower()
	studio_role = claims["role"]
	scope_map = build_helpdesk_scope_map(
		org_slug=claims.get("organization_slug") or "",
		project_ref=claims.get("project_ref") or "",
		project_name=claims.get("project_name"),
		organization_name=claims.get("organization_name"),
	)

	user = _ensure_user(email, studio_role)
	_ensure_hd_team(scope_map["team_key"], scope_map["team_title"], scope_map["org_slug"], user)
	_ensure_queue_marker(
		scope_map["queue_key"],
		scope_map["queue_title"],
		scope_map["team_key"],
		scope_map["project_ref"],
	)
	_ensure_membership(user, studio_role)
	_ensure_setup_complete()

	frappe.local.login_manager.login_as(user)
	is_agent = studio_role in {"owner", "admin", "developer"}
	redirect = helpdesk_agent_path(scope_map) if is_agent else helpdesk_portal_path(scope_map)
	return {
		"redirect": redirect,
		"email": email,
		"team_key": scope_map["team_key"],
		"queue_key": scope_map["queue_key"],
		"portal": "0" if is_agent else "1",
	}
