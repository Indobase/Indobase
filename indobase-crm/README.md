# Indobase CRM

Native Zoho-oriented sales CRM inside Studio at `/project/[ref]/crm`. Tenant Postgres `crm`
schema with FORCE RLS. See [docs/INDOBASE-CRM.md](../docs/INDOBASE-CRM.md).

| Path | Purpose |
|---|---|
| `db/` | Tenant DDL 001–007 (schema, grants, triggers, Zoho modules, tags/automation, fail-closed multitenancy) |

Install: open CRM once → `POST /api/platform/projects/{ref}/crm/ensure`.
