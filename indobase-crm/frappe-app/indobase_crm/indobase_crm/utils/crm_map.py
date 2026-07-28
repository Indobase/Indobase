"""Deterministic org/project → CRM team / pipeline keys (mirror bridge/src/crm-map.ts)."""

from __future__ import annotations

MAX_KEY_LEN = 64


def _clean_slug(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum() or c == "-")
	return cleaned[:MAX_KEY_LEN]


def _clean_project_ref(value: str) -> str:
	cleaned = "".join(c for c in value.lower() if c.isalnum())
	return cleaned[:40]


def crm_team_key_for_org_slug(org_slug: str) -> str:
	cleaned = _clean_slug(org_slug or "")
	if not cleaned:
		return "ib-crm-org-default"
	return f"ib-crm-org-{cleaned}"[:MAX_KEY_LEN]


def crm_pipeline_key_for_project_ref(project_ref: str) -> str:
	cleaned = _clean_project_ref(project_ref or "")
	if not cleaned:
		return "ib-crm-proj-default"
	return f"ib-crm-proj-{cleaned}"[:MAX_KEY_LEN]


def build_crm_scope_map(
	*,
	org_slug: str,
	project_ref: str,
	project_name: str | None = None,
	organization_name: str | None = None,
) -> dict[str, str]:
	team_key = crm_team_key_for_org_slug(org_slug)
	pipeline_key = crm_pipeline_key_for_project_ref(project_ref)
	return {
		"org_slug": (org_slug or "").strip(),
		"project_ref": (project_ref or "").strip(),
		"team_key": team_key,
		"pipeline_key": pipeline_key,
		"team_title": (organization_name or org_slug or "Organization")[:140],
		"pipeline_title": (project_name or project_ref or "Project")[:140],
	}


def crm_pipeline_path(scope_map: dict[str, str]) -> str:
	return f"/c/{scope_map['team_key']}/{scope_map['pipeline_key']}"
