"""Boot-time patches so Studio SSO users skip Helpdesk setup wizard."""

from __future__ import annotations


def extend_bootinfo(bootinfo) -> None:
	try:
		bootinfo.setup_complete = 1
	except Exception:
		pass
	if isinstance(bootinfo, dict):
		bootinfo["setup_complete"] = 1
