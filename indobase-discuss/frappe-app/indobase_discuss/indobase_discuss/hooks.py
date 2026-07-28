# Indobase Discuss — Frappe extension for Gameplan

app_name = "indobase_discuss"
app_title = "Indobase Discuss"
app_publisher = "Indobase"
app_description = "Studio SSO and org/project space mapping for Indobase Discuss"
app_email = "hello@indobase.in"
app_license = "AGPLv3"

# Rebrand Gameplan chrome where hooks allow — customer-visible strings only.
app_icon_title = "Discuss"

override_whitelisted_methods = {
	"gameplan.api.get_user_info": "indobase_discuss.overrides.api.get_user_info",
}

after_install = "indobase_discuss.install.after_install"
