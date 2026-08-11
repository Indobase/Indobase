# Managed Indobase backend (Builder agents)

Builder auto-provisions the **Indobase backend** for users. Never show engine names
in product UI — users only see "Indobase backend".

## URLs

| Audience | URL |
|----------|-----|
| Apps / browsers | `https://backend.indobase.in` (`VITE_INDOBASE_URL`) |
| Builder admin API (VPS) | `http://103.190.92.248:8090` |

## Builder env (`.249`)

```bash
POCKETBASE_PUBLIC_URL=https://backend.indobase.in
POCKETBASE_ADMIN_URL=http://103.190.92.248:8090
POCKETBASE_URL=http://103.190.92.248:8090
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
APP_HOST_PROVISIONER_URL=http://103.190.92.248:8791
APP_HOST_PROVISIONER_TOKEN=...
```

## Related

- App containers: `docker/app-host/`
- Platform pivot: `docs/BUILDER-PLATFORM-PIVOT.md`
