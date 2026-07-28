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
	return email


@frappe.whitelist(allow_guest=True)
def exchange(token: str | None = None) -> dict[str, str]:
	"""Verify Studio JWT, provision workspace context, log user in, return redirect path."""
	if not token:
		frappe.throw(_("Missing handoff token"), frappe.AuthenticationError)

	claims = verify_studio_handoff(token)
	email = claims["email"].strip().lower()
	workspace_map = build_workspace_map(
		org_slug=claims.get("organization_slug") or "",
		project_ref=claims.get("project_ref") or "",
		project_name=claims.get("project_name"),
		organization_name=claims.get("organization_name"),
	)

	user = _ensure_user(email)
	frappe.local.login_manager.login_as(user)
	redirect = workspace_home_path(workspace_map)
	return {"redirect": redirect, "email": email, "project_key": workspace_map["project_key"]}
