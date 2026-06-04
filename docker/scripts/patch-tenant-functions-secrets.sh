#!/usr/bin/env bash
# Merge KEY=value lines from a .env file into tenant-functions environment in docker-compose.yml.
# Usage on VPS:
#   TENANT_DIR=/var/lib/docker/volumes/.../adralproject-uspulzkzew SECRETS_FILE=/tmp/functions.env ./patch-tenant-functions-secrets.sh
# From Mac (pipes .env without printing):
#   ssh ... 'cat > /tmp/adral-fn.env' < supabase/functions/.env
#   TENANT_DIR=... SECRETS_FILE=/tmp/adral-fn.env bash patch-tenant-functions-secrets.sh
set -euo pipefail

TENANT_DIR="${TENANT_DIR:?set TENANT_DIR}"
SECRETS_FILE="${SECRETS_FILE:?set SECRETS_FILE}"
COMPOSE="${TENANT_DIR}/docker-compose.yml"

if [[ ! -f "$COMPOSE" || ! -f "$SECRETS_FILE" ]]; then
  echo "Missing compose or secrets file." >&2
  exit 1
fi

SKIP='^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)$'
python3 <<'PY'
import os, re, sys

tenant_dir = os.environ["TENANT_DIR"]
secrets_file = os.environ["SECRETS_FILE"]
compose_path = os.path.join(tenant_dir, "docker-compose.yml")
skip = re.compile(os.environ.get("SKIP", r"^$"))

secrets = {}
for line in open(secrets_file):
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        continue
    k, _, v = line.partition("=")
    k, v = k.strip(), v.strip().strip('"').strip("'")
    if not v or skip.match(k):
        continue
    secrets[k] = v

text = open(compose_path).read()
marker = "  tenant-functions:"
if marker not in text:
    sys.exit("tenant-functions service not found in compose")

lines = text.splitlines()
out = []
i = 0
in_tf = False
in_env = False
env_indent = None
existing = set()

while i < len(lines):
    line = lines[i]
    if line.startswith("  tenant-functions:"):
        in_tf = True
        out.append(line)
        i += 1
        continue
    if in_tf and re.match(r"^  [a-z].*:", line) and not line.startswith("  tenant-functions"):
        if in_env and secrets:
            for k, v in sorted(secrets.items()):
                if k not in existing:
                    out.append(f'{env_indent}{k}: "{v.replace(chr(34), chr(92)+chr(34))}"')
        in_tf = in_env = False
        out.append(line)
        i += 1
        continue
    if in_tf and line.strip() == "environment:":
        in_env = True
        env_indent = line[: len(line) - len(line.lstrip())] + "  "
        out.append(line)
        i += 1
        continue
    if in_env:
        m = re.match(r'^(\s+)([A-Z0-9_]+):\s*', line)
        if m and not line.strip().startswith("#"):
            existing.add(m.group(2))
            key = m.group(2)
            if key in secrets:
                indent = m.group(1)
                val = secrets[key].replace('"', '\\"')
                out.append(f'{indent}{key}: "{val}"')
                del secrets[key]
                i += 1
                continue
        # End of environment block (next key at service level, e.g. volumes:)
        if re.match(r"^    [a-z].*:", line):
            for k, v in sorted(secrets.items()):
                if k not in existing:
                    out.append(f'{env_indent}{k}: "{v.replace(chr(34), chr(92)+chr(34))}"')
            secrets.clear()
            in_env = False
    out.append(line)
    i += 1

open(compose_path, "w").write("\n".join(out) + ("\n" if out and out[-1] else ""))
print(f"Patched {compose_path} ({len(existing)} existing env keys, added/updated secrets)")
PY

cd "$TENANT_DIR" && docker compose up -d tenant-functions
echo "tenant-functions restarted."
