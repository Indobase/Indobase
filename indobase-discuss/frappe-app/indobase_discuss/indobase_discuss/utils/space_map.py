"""Deterministic org/project → GP Team / GP Project keys (mirror bridge/src/space-map.ts)."""

from __future__ import annotations

import re

MAX_KEY_LEN = 64


def _clean_slug(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum() or c == "-")
	return cleaned[:MAX_KEY_LEN]


def _clean_project_ref(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum())
	return cleaned[:40]


def discuss_team_key_for_org_slug(org_slug: str) -> str:
	cleaned = _clean_slug(org_slug or "")
	if not cleaned:
		return "ib-org-default"
	return f"ib-org-{cleaned}"[:MAX_KEY_LEN]


def discuss_space_key_for_project_ref(project_ref: str) -> str:
	cleaned = _clean_project_ref(project_ref or "")
	if not cleaned:
		return "ib-proj-default"
	return f"ib-proj-{cleaned}"[:MAX_KEY_LEN]


def build_discuss_space_map(
	*,
	org_slug: str,
	project_ref: str,
	project_name: str | None = None,
	organization_name: str | None = None,
) -> dict[str, str]:
	team_key = discuss_team_key_for_org_slug(org_slug)
	space_key = discuss_space_key_for_project_ref(project_ref)
	return {
		"org_slug": (org_slug or "").strip(),
		"project_ref": (project_ref or "").strip(),
		"team_key": team_key,
		"space_key": space_key,
		"team_title": (organization_name or org_slug or "Organization")[:140],
		"space_title": (project_name or project_ref or "Project")[:140],
	}


def gameplan_space_path(team: str, space: str) -> str:
	"""Gameplan SPA route uses GP Team / GP Project doc names, not indobase keys."""
	from urllib.parse import quote

	return f"/community/{quote(team, safe='')}/space/{quote(space, safe='')}"
