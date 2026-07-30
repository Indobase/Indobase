"""Install custom fields used for org/project → Workspace mapping."""

from __future__ import annotations

import frappe


def after_install() -> None:
	_add_custom_fields()
	_set_system_branding()


def _add_custom_fields() -> None:
	custom_fields = {
		"Drive Team": [
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
		"File": [
			{
				"fieldname": "indobase_project_key",
				"label": "Indobase Project Key",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "folder",
			},
			{
				"fieldname": "indobase_project_ref",
				"label": "Indobase Project Ref",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "indobase_project_key",
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
	try:
		frappe.db.set_single_value("Website Settings", "app_name", "Indobase Workspace")
	except Exception:
		pass
