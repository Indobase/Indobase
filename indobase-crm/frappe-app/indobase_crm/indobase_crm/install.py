"""Install custom fields and branding for org/project → CRM scoping."""

from __future__ import annotations

import frappe


def after_install() -> None:
	_add_custom_fields()
	_set_system_branding()


def _add_custom_fields() -> None:
	"""Scope keys on CRM Lead/Deal for org/project isolation."""
	custom_fields = {
		"CRM Organization": [
			{
				"fieldname": "indobase_team_key",
				"label": "Indobase Team Key",
				"fieldtype": "Data",
				"unique": 1,
				"read_only": 1,
				"insert_after": "organization_name",
			},
			{
				"fieldname": "indobase_org_slug",
				"label": "Indobase Organization Slug",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "indobase_team_key",
			},
		],
		"CRM Lead": [
			{
				"fieldname": "indobase_team_key",
				"label": "Indobase Team Key",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "lead_name",
			},
			{
				"fieldname": "indobase_pipeline_key",
				"label": "Indobase Pipeline Key",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "indobase_team_key",
			},
		],
		"CRM Deal": [
			{
				"fieldname": "indobase_team_key",
				"label": "Indobase Team Key",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "organization",
			},
			{
				"fieldname": "indobase_pipeline_key",
				"label": "Indobase Pipeline Key",
				"fieldtype": "Data",
				"read_only": 1,
				"insert_after": "indobase_team_key",
			},
		],
	}

	for doctype, fields in custom_fields.items():
		if not frappe.db.exists("DocType", doctype):
			continue
		for field in fields:
			if frappe.db.exists("Custom Field", {"dt": doctype, "fieldname": field["fieldname"]}):
				continue
			doc = frappe.get_doc({"doctype": "Custom Field", "dt": doctype, **field})
			doc.insert(ignore_permissions=True)


def _set_system_branding() -> None:
	try:
		frappe.db.set_single_value("Website Settings", "app_name", "Indobase CRM")
	except Exception:
		pass
	try:
		if frappe.db.exists("DocType", "FCRM Settings"):
			frappe.db.set_single_value("FCRM Settings", "company_name", "Indobase CRM")
	except Exception:
		pass
