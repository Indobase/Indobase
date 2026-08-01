"""Install custom fields used for org/project → Space mapping."""

from __future__ import annotations

import frappe


def after_install() -> None:
	_add_custom_fields()
	_set_system_branding()
	_mark_setup_complete()


def _add_custom_fields() -> None:
	custom_fields = {
		"GP Team": [
			{
				"fieldname": "indobase_team_key",
				"label": "Indobase Team Key",
				"fieldtype": "Data",
				"unique": 1,
				"read_only": 1,
				"insert_after": "title",
			},
			{
				"fieldname": "indobase_org_slug",
				"label": "Indobase Organization Slug",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "indobase_team_key",
			},
		],
		"GP Project": [
			{
				"fieldname": "indobase_space_key",
				"label": "Indobase Space Key",
				"fieldtype": "Data",
				"unique": 1,
				"read_only": 1,
				"insert_after": "title",
			},
			{
				"fieldname": "indobase_project_ref",
				"label": "Indobase Project Ref",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "indobase_space_key",
			},
		],
	}

	for doctype, fields in custom_fields.items():
		for field in fields:
			if frappe.db.exists("Custom Field", {"dt": doctype, "fieldname": field["fieldname"]}):
				continue
			doc = frappe.get_doc({"doctype": "Custom Field", "dt": doctype, **field})
			doc.insert(ignore_permissions=True)


def _set_system_branding() -> None:
	"""Best-effort rebrand of website/app title — no user-visible Gameplan strings."""
	try:
		frappe.db.set_single_value("Website Settings", "app_name", "Indobase Discuss")
	except Exception:
		pass
	try:
		frappe.db.set_default("desktop:home_page", "gameplan")
	except Exception:
		pass


def _mark_setup_complete() -> None:
	try:
		frappe.db.set_default("setup_complete", "1")
	except Exception:
		pass
	try:
		frappe.db.set_single_value("System Settings", "setup_complete", 1)
	except Exception:
		pass
