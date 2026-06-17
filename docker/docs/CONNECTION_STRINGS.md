# Indobase connection strings

Copy connection strings from **Studio → Project → Connect**, or use these shapes for docs and automation.

## Hosted tenant (typical production)

| Mode | Port | Example |
|------|------|---------|
| **Direct** | 5432 | `postgresql://postgres:[PASSWORD]@[PROJECT-REF].indobase.in:5432/postgres` |
| **Session pooler** | 5432 | `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[PROJECT-REF].indobase.in:5432/postgres` |
| **Transaction pooler** | 6543 | `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[PROJECT-REF].indobase.in:6543/postgres` |

- Replace `[PROJECT-REF]` with the project ref from the dashboard URL.
- URL-encode special characters in passwords ([percent-encoding](https://en.wikipedia.org/wiki/Percent-encoding)).
- Transaction mode does not support prepared statements; disable them in your ORM when using port **6543**.

## Local Docker (control plane)

Use values from `docker/.env.example` — typically `postgresql://postgres:[POSTGRES_PASSWORD]@localhost:5432/postgres` against the shared `indobase-db` container.

## Pooler availability

Per-tenant Supavisor is enabled when `SAAS_TENANT_EMBED_SUPAVISOR=true` on Studio. Otherwise use the **direct** string on port 5432.

See `apps/studio/lib/api/saas/platform-projects.ts` (`getSaaSSupavisorConfigRows`) for how Connect builds pooler URIs.
