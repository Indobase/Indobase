# Indobase CRM — Zoho-oriented sales CRM inside Studio

Indobase CRM is a **Studio surface** at `/project/[ref]/crm`. Data lives in each project's
**tenant Postgres** (`crm` schema, FORCE RLS). No separate CRM login.

| Surface | URL |
|---|---|
| Studio route | `https://studio.indobase.in/project/{ref}/crm` |
| Product name | **CRM** (never Zoho / Twenty / Frappe in UI) |

---

## Zoho-like modules (current)

| Module | Capability |
|---|---|
| **Home** | Open leads, contacts, open deals, pipeline value, activity list |
| **Leads** | Create, status workflow, detail + tags/notes/activities, **Convert lead** (deal title/stage/amount) → Contact + Account + Deal |
| **Contacts** | List/detail + tags, notes, linked activities |
| **Accounts** | Companies list/detail + tags, notes, linked activities |
| **Deals** | Kanban board + list/detail + tags, notes, linked activities |
| **Activities** | Tasks / calls / meetings with status |
| **Reports** | Pipeline by stage (`crm.pipeline_report`) |
| **Automations** | Status/stage → auto-create activity (workflow-lite) |

Still **not** Zoho parity: custom fields builder, email sync, full blueprints, forecasts,
territories, inventory, reports designer, mobile apps, marketplace.

---

## Architecture

Same model as Discuss: Studio session → temporary project JWT (`sub` + `project_ref`) → tenant
PostgREST `crm` schema with FORCE RLS. Schema install via `POST …/crm/ensure` (`indobase-crm/db` 001–007).
JWT `project_ref` is required for reads and writes (`007_crm_multitenancy.sql`); missing claim → empty RLS.
---

## Role mapping

| Studio org role | CRM role |
|---|---|
| Owner / Administrator / Developer | write |
| Read-only | viewer (RLS rejects writes) |
