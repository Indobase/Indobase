"""Deterministic org/project → Workspace team / project keys (mirror bridge/src/workspace-map.ts)."""

from __future__ import annotations

MAX_KEY_LEN = 64


def _clean_slug(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum() or c == "-")
	return cleaned[:MAX_KEY_LEN]


def _clean_project_ref(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum())
	return cleaned[:40]


def workspace_team_key_for_org_slug(org_slug: str) -> str:
	cleaned = _clean_slug(org_slug or "")
	if not cleaned:
		return "ib-ws-org-default"
	return f"ib-ws-org-{cleaned}"[:MAX_KEY_LEN]


def workspace_project_key_for_project_ref(project_ref: str) -> str:
	cleaned = _clean_project_ref(project_ref or "")
	if not cleaned:
		return "ib-ws-proj-default"
	return f"ib-ws-proj-{cleaned}"[:MAX_KEY_LEN]


def build_workspace_map(
	*,
	org_slug: str,
	project_ref: str,
	project_name: str | None = None,
	organization_name: str | None = None,
) -> dict[str, str]:
	team_key = workspace_team_key_for_org_slug(org_slug)
	project_key = workspace_project_key_for_project_ref(project_ref)
	return {
		"org_slug": (org_slug or "").strip(),
		"project_ref": (project_ref or "").strip(),
		"team_key": team_key,
		"project_key": project_key,
		"team_title": (organization_name or org_slug or "Organization")[:140],
		"project_title": (project_name or project_ref or "Project")[:140],
	}


def workspace_home_path(workspace_map: dict[str, str]) -> str:
	return f"/s/{workspace_map['team_key']}/{workspace_map['project_key']}"
