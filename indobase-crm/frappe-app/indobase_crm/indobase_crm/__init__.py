# Copyright (c) Indobase — AGPL-3.0 (Frappe CRM upstream: Frappe Technologies)

from __future__ import annotations


def _patch_crm_boot() -> None:
	"""Ensure CRM SPA boot skips setup/onboarding wizards for Studio SSO users."""
	try:
		import crm.www.crm as crm_www

		if getattr(crm_www.get_boot, "_indobase_patched", False):
			return

		_original_get_boot = crm_www.get_boot

		def get_boot():
			boot = _original_get_boot()
			boot.setup_complete = 1
			if isinstance(boot, dict):
				boot["setup_complete"] = 1
				boot["demo_data_created"] = True
			return boot

		get_boot._indobase_patched = True  # type: ignore[attr-defined]
		crm_www.get_boot = get_boot
	except Exception:
		pass


_patch_crm_boot()
