"""Studio SSO exchange + org/project team/pipeline provisioning for Frappe CRM."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import frappe
from frappe import _

from indobase_crm.utils.crm_map import build_crm_scope_map, crm_pipeline_path

AUDIENCE = "indobase-crm"
ALLOWED_ROLES = frozenset({"owner", "admin", "developer", "viewer"})
CRM_SALES_MANAGER = "Sales Manager"
CRM_SALES_USER = "Sales User"


def _handoff_secret() -> str:
	secret = (frappe.conf.get("crm_handoff_secret") or frappe.conf.get("studio_handoff_secret") or "").strip()
	if len(secret) < 32:
		frappe.throw(_("CRM SSO is not configured"), frappe.PermissionError)
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
		frappe.throw(_("CRM access requires an organization role"), frappe.PermissionError)

	email = (payload.get("email") or "").strip().lower()
	project_ref = (payload.get("project_ref") or "").strip()
	org_slug = (payload.get("organization_slug") or "").strip()
	if not email or "@" not in email or not project_ref or not org_slug:
		frappe.throw(_("Handoff token missing required claims"), frappe.AuthenticationError)

	return payload


def _map_crm_role(studio_role: str) -> str:
	return CRM_SALES_USER if studio_role == "viewer" else CRM_SALES_MANAGER


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
	user.add_roles(_map_crm_role("developer"))
	return email


def _ensure_crm_organization(team_key: str, title: str, org_slug: str) -> str | None:
	if not frappe.db.exists("DocType", "CRM Organization"):
		return None

	existing = frappe.db.get_value("CRM Organization", {"indobase_team_key": team_key}, "name")
	if existing:
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "CRM Organization",
			"organization_name": title,
			"indobase_team_key": team_key,
			"indobase_org_slug": org_slug,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _ensure_pipeline_marker(pipeline_key: str, title: str, team_key: str, project_ref: str) -> None:
	"""Store pipeline scope in FCRM Settings custom field or site config for filtering."""
	frappe.db.set_default(f"indobase_crm_pipeline_{pipeline_key}", json.dumps({
		"pipeline_key": pipeline_key,
		"pipeline_title": title,
		"team_key": team_key,
		"project_ref": project_ref,
	}))


def _ensure_membership(user: str, studio_role: str) -> None:
	crm_role = _map_crm_role(studio_role)
	if crm_role in frappe.get_roles(user):
		return
	frappe.get_doc(
		{
			"doctype": "Has Role",
			"parent": user,
			"parenttype": "User",
			"parentfield": "roles",
			"role": crm_role,
		}
	).insert(ignore_permissions=True)


def _ensure_setup_complete() -> None:
	try:
		if not frappe.db.get_single_value("System Settings", "setup_complete"):
			frappe.db.set_single_value("System Settings", "setup_complete", 1)
			frappe.db.set_default("setup_complete", "1")
		if frappe.db.exists("DocType", "FCRM Settings"):
			frappe.db.set_single_value("FCRM Settings", "persona_captured", 1)
		frappe.db.set_default("crm_demo_data_created", "1")
	except Exception:
		pass


@frappe.whitelist(allow_guest=True)
def exchange(token: str | None = None) -> dict[str, str]:
	"""Verify Studio JWT, provision team/pipeline scope, log user in, return redirect path."""
	if not token:
		frappe.throw(_("Missing handoff token"), frappe.AuthenticationError)

	claims = verify_studio_handoff(token)
	email = claims["email"].strip().lower()
	studio_role = claims["role"]
	scope_map = build_crm_scope_map(
		org_slug=claims.get("organization_slug") or "",
		project_ref=claims.get("project_ref") or "",
		project_name=claims.get("project_name"),
		organization_name=claims.get("organization_name"),
	)

	user = _ensure_user(email)
	_ensure_crm_organization(scope_map["team_key"], scope_map["team_title"], scope_map["org_slug"])
	_ensure_pipeline_marker(
		scope_map["pipeline_key"],
		scope_map["pipeline_title"],
		scope_map["team_key"],
		scope_map["project_ref"],
	)
	_ensure_membership(user, studio_role)
	_ensure_setup_complete()

	frappe.local.login_manager.login_as(user)
	redirect = crm_pipeline_path(scope_map)
	return {
		"redirect": redirect,
		"email": email,
		"team_key": scope_map["team_key"],
		"pipeline_key": scope_map["pipeline_key"],
	}
