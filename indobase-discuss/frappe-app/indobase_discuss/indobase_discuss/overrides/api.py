"""Customer-facing API overrides — keep upstream imports internal."""

from __future__ import annotations

import frappe


@frappe.whitelist(allow_guest=True)
def get_user_info(user: str | None = None):
	"""Wrap upstream get_user_info; strip email for guest-role callers."""
	from gameplan.api import get_user_info as upstream_get_user_info

	data = upstream_get_user_info(user)
	roles = frappe.get_roles(frappe.session.user)
	if "Gameplan Guest" in roles and isinstance(data, dict):
		data.pop("email", None)
	return data
