# Indobase CRM — Frappe extension for Frappe CRM

app_name = "indobase_crm"
app_title = "Indobase CRM"
app_publisher = "Indobase"
app_description = "Studio SSO and org/project pipeline mapping for Indobase CRM"
app_email = "hello@indobase.in"
app_license = "AGPLv3"

app_icon_title = "CRM"

after_install = "indobase_crm.install.after_install"

extend_bootinfo = "indobase_crm.boot.extend_bootinfo"

# Frappe CRM only registers `/crm/<path>` — bare `/crm` 404s without this rule.
website_route_rules = [
	{"from_route": "/crm", "to_route": "crm"},
]
