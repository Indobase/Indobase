#!/usr/bin/env bash
# Apply Adral auth settings from supabase/config.indobase.toml (no Google OAuth secrets).
set -euo pipefail

REF="${PROJECT_REF:-adralproject-uspulzkzew}"
TENANT_DIR="${TENANT_DIR:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data/${REF}}"
COMPOSE="${TENANT_DIR}/docker-compose.yml"

ALLOW_LIST="https://staging.adral.ai,https://staging.adral.ai/**,https://adral-staging.indobase.in,https://adral-staging.indobase.in/**,https://adral.ai,https://adral.ai/**,https://${REF}.indobase.in,https://${REF}.indobase.in/**,http://localhost:5173,http://localhost:5173/**,http://127.0.0.1:5173,http://127.0.0.1:5173/**"

python3 <<PY
import re, os
path = os.environ["COMPOSE"]
text = open(path).read()
replacements = {
    "GOTRUE_SITE_URL": "https://staging.adral.ai",
    "GOTRUE_URI_ALLOW_LIST": os.environ["ALLOW_LIST"],
    "GOTRUE_EXTERNAL_GOOGLE_ENABLED": "false",
    "GOTRUE_DISABLE_SIGNUP": "false",
    "GOTRUE_MAILER_AUTOCONFIRM": "false",
}
for key, val in replacements.items():
    pat = rf"({key}:\\s*)(['\"][^'\"]*['\"]|\"[^\"]*\"|[^\\n]+)"
    if re.search(pat, text):
        text = re.sub(pat, lambda m, k=key, v=val: f"{m.group(1)}'{v}'" if not v.startswith("'") else f"{m.group(1)}{v}", text, count=1)
    elif "tenant-auth:" in text:
        text = text.replace(
            "GOTRUE_SITE_URL:",
            f"{key}: '{val}'\\n      GOTRUE_SITE_URL:",
            1,
        ) if key != "GOTRUE_SITE_URL" else text
for key, val in replacements.items():
    if key + ":" not in text and "tenant-auth" in text:
        pass
open(path, "w").write(text)
print("patched", path)
PY

cd "$TENANT_DIR" && docker compose up -d tenant-auth
echo "Auth restarted for ${REF}"
