# Indobase Discuss

Native team chat for Indobase projects. Conversation lives in each project's **tenant
Postgres** (`discuss` schema, FORCE RLS) and the UI is a Studio route at
`/project/[ref]/discuss`. See [docs/INDOBASE-DISCUSS.md](../docs/INDOBASE-DISCUSS.md).

| Surface | URL |
|---|---|
| Studio | `https://studio.indobase.in/project/{ref}/discuss` |
| Product name | **Discuss** only (never Mattermost / Gameplan / Frappe in UI) |

## Layout

| Path | Purpose |
|---|---|
| `db/` | Tenant DDL — schema, functions, grants (installed via Studio `/discuss/ensure`) |
| `bridge/` | **Legacy** Gameplan SSO bridge (superseded for product UX) |
| `NOTICE.md` | Attribution for any retained upstream engines |

## Studio integration

- UI: `apps/studio/components/interfaces/Discuss/`
- Data layer: `apps/studio/data/discuss/`
- Schema install: `POST /api/platform/projects/{ref}/discuss/ensure`
- Activity publishers: `apps/studio/lib/api/saas/discuss-events.ts`

New tenant stacks expose `discuss` in `PGRST_DB_SCHEMAS`. After deploying Studio, open
Discuss once per project to install the schema.
