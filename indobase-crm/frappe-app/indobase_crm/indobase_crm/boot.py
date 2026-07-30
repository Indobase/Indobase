"""Boot-time patches so Studio SSO users skip Frappe CRM setup/onboarding wizards."""

from __future__ import annotations


def extend_bootinfo(bootinfo) -> None:
	"""Force completed setup flags in desk boot — avoids /app/setup-wizard redirects."""
	try:
		bootinfo.setup_complete = 1
	except Exception:
		pass

	if isinstance(bootinfo, dict):
		bootinfo["setup_complete"] = 1
		bootinfo["demo_data_created"] = True
