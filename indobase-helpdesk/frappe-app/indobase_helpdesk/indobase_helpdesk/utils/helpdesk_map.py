"""Deterministic org/project → Helpdesk team / queue keys (mirror bridge/src/helpdesk-map.ts)."""

from __future__ import annotations

MAX_KEY_LEN = 64


def _clean_slug(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum() or c == "-")
	return cleaned[:MAX_KEY_LEN]


def _clean_project_ref(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum())
	return cleaned[:40]


def helpdesk_team_key_for_org_slug(org_slug: str) -> str:
	cleaned = _clean_slug(org_slug or "")
	if not cleaned:
		return "ib-hd-org-default"
	return f"ib-hd-org-{cleaned}"[:MAX_KEY_LEN]


def helpdesk_queue_key_for_project_ref(project_ref: str) -> str:
	cleaned = _clean_project_ref(project_ref or "")
	if not cleaned:
		return "ib-hd-proj-default"
	return f"ib-hd-proj-{cleaned}"[:MAX_KEY_LEN]


def build_helpdesk_scope_map(
	*,
	org_slug: str,
	project_ref: str,
	project_name: str | None = None,
	organization_name: str | None = None,
) -> dict[str, str]:
	team_key = helpdesk_team_key_for_org_slug(org_slug)
	queue_key = helpdesk_queue_key_for_project_ref(project_ref)
	return {
		"org_slug": (org_slug or "").strip(),
		"project_ref": (project_ref or "").strip(),
		"team_key": team_key,
		"queue_key": queue_key,
		"team_title": (organization_name or org_slug or "Organization")[:140],
		"queue_title": (project_name or project_ref or "Project")[:140],
	}


def helpdesk_agent_path(scope_map: dict[str, str]) -> str:
	return f"/h/{scope_map['team_key']}/{scope_map['queue_key']}"


def helpdesk_portal_path(scope_map: dict[str, str]) -> str:
	return f"/portal/{scope_map['team_key']}/{scope_map['queue_key']}"
