#!/usr/bin/env bash
# Repair all SaaS tenant stacks on the VPS: network name, aux passwords, compose up, auth grants.
# Run on the host: bash docker/scripts/repair-tenant-stacks-on-vps.sh
set -euo pipefail

TENANTS_ROOT="${TENANTS_ROOT:-/var/lib/docker/volumes/indobase-backend-bmqhan_tenants-data/_data}"
DB_CONTAINER="${DB_CONTAINER:-indobase-db}"
NET_NAME="${SAAS_DOCKER_NETWORK_NAME:-indobase-backend-bmqhan_default}"
PG_ADMIN_USER="${PG_ADMIN_USER:-supabase_admin}"
PG_ADMIN_PASSWORD="${PG_ADMIN_PASSWORD:-${POSTGRES_PASSWORD:-}}"
AUX_PASS="${SAAS_DATA_PLANE_AUX_ROLE_PASSWORD:-}"
# Dual-VPS: tenant auth cannot use Docker DNS names on the control-plane host.
# Prefer SAAS_TENANT_SMTP_HOST / SAAS_CONTROL_PLANE_HOST (e.g. 103.190.92.249).
_raw_smtp_host="${SAAS_TENANT_SMTP_HOST:-${SMTP_HOST:-}}"
case "${_raw_smtp_host}" in
  indobase-mail|indobase-smtp-relay|supabase-mail|mail|'')
    SMTP_HOST="${SAAS_CONTROL_PLANE_HOST:-${SAAS_SMTP_PUBLIC_HOST:-${_raw_smtp_host:-indobase-mail}}}"
    ;;
  *)
    SMTP_HOST="${_raw_smtp_host}"
    ;;
esac
SMTP_PORT="${SAAS_TENANT_SMTP_PORT:-${SMTP_PORT:-587}}"
if [[ "${SMTP_HOST}" == "indobase-mail" || "${SMTP_HOST}" == "supabase-mail" ]]; then
  SMTP_PORT="${SAAS_TENANT_SMTP_PORT:-${SMTP_PORT:-2500}}"
fi
SMTP_USER="${SAAS_TENANT_SMTP_USER:-${SMTP_USER:-}}"
SMTP_PASS="${SAAS_TENANT_SMTP_PASS:-${SMTP_PASS:-}}"
SMTP_ADMIN_EMAIL="${SAAS_TENANT_SMTP_ADMIN_EMAIL:-${SMTP_ADMIN_EMAIL:-auth@indobase.in}}"
SMTP_SENDER_NAME="${SAAS_TENANT_SMTP_SENDER_NAME:-${SMTP_SENDER_NAME:-Indobase}}"
TEMPLATES_BASE="${SAAS_TENANT_MAILER_TEMPLATES_BASE:-}"
if [[ -z "${TEMPLATES_BASE}" ]]; then
  if [[ -n "${SAAS_CONTROL_PLANE_HOST:-${SAAS_SMTP_PUBLIC_HOST:-}}" ]]; then
    _tpl_host="${SAAS_CONTROL_PLANE_HOST:-${SAAS_SMTP_PUBLIC_HOST}}"
    TEMPLATES_BASE="http://${_tpl_host}:${TEMPLATES_SERVER_PUBLISH_PORT:-8095}"
  else
    TEMPLATES_BASE="http://indobase-templates-server"
  fi
fi
TEMPLATES_BASE="${TEMPLATES_BASE%/}"
export SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_ADMIN_EMAIL SMTP_SENDER_NAME TEMPLATES_BASE

if [[ -z "$PG_ADMIN_PASSWORD" ]]; then
  echo "Set PG_ADMIN_PASSWORD or POSTGRES_PASSWORD (supabase_admin login)" >&2
  exit 1
fi
if [[ -z "$AUX_PASS" ]]; then
  echo "Set SAAS_DATA_PLANE_AUX_ROLE_PASSWORD" >&2
  exit 1
fi

if [[ "$AUX_PASS" != "$PG_ADMIN_PASSWORD" ]]; then
  echo "WARN: SAAS_DATA_PLANE_AUX_ROLE_PASSWORD differs from POSTGRES_PASSWORD on a single Postgres host." >&2
  echo "      Cluster roles (authenticator, supabase_storage_admin, …) can only have one password." >&2
  echo "      Align both env vars before fleet repair (see docker/DOKPLOY-DATA-PLANE.md)." >&2
fi

PW_LIT="'${AUX_PASS//\'/\'\'}'"

psql_admin() {
  docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$1" -v ON_ERROR_STOP=1 -c "$2"
}

echo "Syncing cluster authenticator password (once)..."
psql_admin postgres "alter role authenticator password $PW_LIT" || true

repair_ref() {
  local ref="$1"
  local dir="$TENANTS_ROOT/$ref"
  local dbname="tenantdb_${ref//-/_}"
  local tenant_role="tenant_${ref//-/_}"

  [[ -f "$dir/docker-compose.yml" ]] || return 0

  echo ""
  echo ">>> $ref"

  if grep -q 'name: indobase_default' "$dir/docker-compose.yml" 2>/dev/null; then
    sed -i "s/name: indobase_default/name: ${NET_NAME}/g" "$dir/docker-compose.yml"
    echo "  patched external network -> $NET_NAME"
  fi

  # Tenant compose files often keep stale aux-role passwords after DB role sync.
  if python3 - "$dir/docker-compose.yml" "$AUX_PASS" <<'PY' | grep -q changed; then
import re, sys
path, aux = sys.argv[1], sys.argv[2]
text = open(path).read()
orig = text
# Legacy bootstrap password still present on many VPS stacks.
text = text.replace("kVfP0FQo2cGGlqAX", aux)
for role in ("authenticator", "supabase_auth_admin", "supabase_storage_admin", "supabase_admin"):
    text = re.sub(rf"(postgresql://{role}:)[^@]+(@db:[0-9]+/[^'\n]+)", rf"\1{aux}\2", text)
    text = re.sub(rf"(postgresql://{role}:)[^@]+(@[^:/]+:[0-9]+/[^'\n]+)", rf"\1{aux}\2", text)
text = re.sub(r"(DB_PASSWORD: ')[^']+(')", rf"\1{aux}\2", text)
if text != orig:
    open(path, "w").write(text)
    print("changed")
else:
    print("same")
PY
    echo "  patched compose DB passwords -> AUX_PASS"
  fi

  # Tenant GoTrue must reach shared mail (Inbucket or production SMTP) on the compose network.
  if grep -q 'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI:' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
fixed, n = re.subn(
    r"GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: '([^']+)'/auth/v1/callback",
    r"GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: '\\1/auth/v1/callback'",
    text,
)
if n:
    open(path, "w").write(fixed)
    print(f"  patched broken GOOGLE_REDIRECT_URI ({n})")
PY
  fi

  if grep -q 'GOTRUE_SMTP_HOST:' "$dir/docker-compose.yml" 2>/dev/null; then
  python3 - "$dir/docker-compose.yml" "$ref" <<'PY'
import re, sys
path, ref = sys.argv[1], sys.argv[2]
import os
smtp_host = os.environ.get("SMTP_HOST", "indobase-mail")
smtp_port = os.environ.get("SMTP_PORT", "587")
smtp_user = os.environ.get("SMTP_USER", "")
smtp_pass = os.environ.get("SMTP_PASS", "")
smtp_admin = os.environ.get("SMTP_ADMIN_EMAIL", "auth@indobase.in")
smtp_sender = os.environ.get("SMTP_SENDER_NAME", "Indobase")
templates_base = os.environ.get("TEMPLATES_BASE", "http://indobase-templates-server").rstrip("/")
def yaml_quote(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
domain = os.environ.get("SAAS_PUBLIC_DOMAIN", "indobase.in").strip().lstrip("https://").split("/")[0]
api_host = f"{ref}.{domain}"
text = open(path).read()
replacements = {
    r'GOTRUE_SMTP_HOST:.*': f'GOTRUE_SMTP_HOST: "{smtp_host}"',
    r'GOTRUE_SMTP_PORT:.*': f'GOTRUE_SMTP_PORT: "{smtp_port}"',
    r'GOTRUE_SMTP_USER:.*': f'GOTRUE_SMTP_USER: {yaml_quote(smtp_user)}',
    r'GOTRUE_SMTP_PASS:.*': f'GOTRUE_SMTP_PASS: {yaml_quote(smtp_pass)}',
    r'GOTRUE_SMTP_ADMIN_EMAIL:.*': f'GOTRUE_SMTP_ADMIN_EMAIL: "{smtp_admin}"',
    r'GOTRUE_SMTP_SENDER_NAME:.*': f'GOTRUE_SMTP_SENDER_NAME: {smtp_sender}',
    r'GOTRUE_MAILER_AUTOCONFIRM:.*': 'GOTRUE_MAILER_AUTOCONFIRM: "false"',
    r'GOTRUE_API_MAX_REQUEST_DURATION:.*': 'GOTRUE_API_MAX_REQUEST_DURATION: "30s"',
    r'GOTRUE_SMTP_MAX_FREQUENCY:.*': 'GOTRUE_SMTP_MAX_FREQUENCY: "60s"',
    r'GOTRUE_MAILER_TEMPLATES_CONFIRMATION:.*': f'GOTRUE_MAILER_TEMPLATES_CONFIRMATION: {templates_base}/tenant-confirmation.html',
    r'GOTRUE_MAILER_TEMPLATES_RECOVERY:.*': f'GOTRUE_MAILER_TEMPLATES_RECOVERY: {templates_base}/tenant-recovery.html',
    r'GOTRUE_MAILER_TEMPLATES_MAGIC_LINK:.*': f'GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: {templates_base}/tenant-magic-link.html',
    r'GOTRUE_MAILER_TEMPLATES_INVITE:.*': f'GOTRUE_MAILER_TEMPLATES_INVITE: {templates_base}/tenant-invite.html',
    r'GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE:.*': f'GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: {templates_base}/tenant-email-change.html',
}
for pat, val in replacements.items():
    text, n = re.subn(pat, val, text, count=1)
if "GOTRUE_MAILER_TEMPLATES_CONFIRMATION:" not in text and "GOTRUE_MAILER_URLPATHS_CONFIRMATION:" in text:
    text = text.replace(
        'GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify',
        'GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify\n'
        f'      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: {templates_base}/tenant-confirmation.html\n'
        f'      GOTRUE_MAILER_TEMPLATES_RECOVERY: {templates_base}/tenant-recovery.html\n'
        f'      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: {templates_base}/tenant-magic-link.html\n'
        f'      GOTRUE_MAILER_TEMPLATES_INVITE: {templates_base}/tenant-invite.html\n'
        f'      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: {templates_base}/tenant-email-change.html',
        1,
    )
if "GOTRUE_MAILER_EXTERNAL_HOSTS:" not in text and "GOTRUE_MAILER_AUTOCONFIRM:" in text:
    text = text.replace(
        'GOTRUE_MAILER_AUTOCONFIRM: "false"',
        f'GOTRUE_MAILER_AUTOCONFIRM: "false"\n      GOTRUE_MAILER_EXTERNAL_HOSTS: "{api_host},api.{domain},studio.{domain}"',
        1,
    )
if "GOTRUE_API_MAX_REQUEST_DURATION:" not in text and "GOTRUE_MAILER_AUTOCONFIRM:" in text:
    text = text.replace(
        'GOTRUE_MAILER_AUTOCONFIRM: "false"',
        'GOTRUE_MAILER_AUTOCONFIRM: "false"\n      GOTRUE_API_MAX_REQUEST_DURATION: "30s"\n      GOTRUE_SMTP_MAX_FREQUENCY: "60s"',
        1,
    )
open(path, "w").write(text)
PY
    echo "  patched tenant-auth SMTP -> ${SMTP_HOST}:${SMTP_PORT} templates -> ${TEMPLATES_BASE}"
  fi

  for role in "$tenant_role"; do
    psql_admin "$dbname" "alter role \"$role\" password $PW_LIT" || true
  done
  psql_admin "$dbname" "alter schema auth owner to supabase_auth_admin" 2>/dev/null || true

  psql_admin "$dbname" "grant connect, create on database \"$dbname\" to authenticator, supabase_admin, supabase_auth_admin, supabase_storage_admin" || true
  psql_admin "$dbname" "grant all on schema storage to supabase_storage_admin, supabase_admin, authenticator" || true
  psql_admin "$dbname" "grant all on schema _realtime to supabase_admin, authenticator" || true

  # Realtime AES-128 requires a 16-character DB_ENC_KEY (older stacks used 24).
  if grep -q "DB_ENC_KEY:" "$dir/docker-compose.yml"; then
    key=$(grep "DB_ENC_KEY:" "$dir/docker-compose.yml" | head -1 | sed -n "s/.*DB_ENC_KEY: '\\([^']*\\)'.*/\\1/p")
    if [[ -n "$key" && ${#key} -gt 16 ]]; then
      newkey="${key:0:16}"
      sed -i "s/DB_ENC_KEY: '${key}'/DB_ENC_KEY: '${newkey}'/" "$dir/docker-compose.yml"
      echo "  patched DB_ENC_KEY length (${#key} -> 16)"
    fi
  fi

  # Edge runtime needs an explicit start command and a main router file.
  if ! grep -q 'main-service' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" <<'PY'
import sys
path = sys.argv[1]
text = open(path).read()
needle = "    ports:\n      - \"127.0.0.1:"
idx = text.find("  tenant-functions:")
if idx == -1:
    sys.exit(0)
port_idx = text.find(needle, idx)
if port_idx == -1 or "command:" in text[idx:port_idx]:
    sys.exit(0)
insert = """    command:
      - start
      - --main-service
      - /home/deno/functions/main
"""
open(path, "w").write(text[:port_idx] + insert + text[port_idx:])
PY
    echo "  added tenant-functions start command"
  fi

  vol="indobase-tenant-${ref}_tenant-functions-${ref}"
  fn_mp=""
  if docker volume inspect "$vol" >/dev/null 2>&1; then
    fn_mp="$(docker volume inspect "$vol" --format '{{.Mountpoint}}')"
  fi
  if [[ -n "$fn_mp" && ! -f "${fn_mp}/main/index.ts" ]]; then
    stub="$(mktemp)"
    cat >"$stub" <<'TS'
Deno.serve(async (req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean)
  const name = parts[0]
  if (!name) {
    return new Response(JSON.stringify({ msg: "missing function name" }), { status: 400, headers: { "Content-Type": "application/json" } })
  }
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject()),
    })
    return await worker.fetch(req)
  } catch (e) {
    return new Response(JSON.stringify({ msg: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
TS
    docker run --rm -v "$vol:/f" -v "$stub:/seed/index.ts:ro" alpine sh -c 'mkdir -p /f/main && cp /seed/index.ts /f/main/index.ts && chmod -R a+rX /f' >/dev/null
    rm -f "$stub"
    echo "  seeded functions main"
  fi

  if grep -q '127.0.0.1:' "$dir/docker-compose.yml" 2>/dev/null; then
    sed -i 's/127.0.0.1:/0.0.0.0:/g' "$dir/docker-compose.yml"
    echo "  patched port bindings (0.0.0.0 for Traefik bridge access)"
  fi

  if grep -q 'FILE_SIZE_LIMIT: "52428800"' "$dir/docker-compose.yml" 2>/dev/null; then
    sed -i 's/FILE_SIZE_LIMIT: "52428800"/FILE_SIZE_LIMIT: "5368709120"/g' "$dir/docker-compose.yml"
    sed -i 's/FILE_SIZE_LIMIT: 52428800/FILE_SIZE_LIMIT: "5368709120"/g' "$dir/docker-compose.yml"
    echo "  patched FILE_SIZE_LIMIT -> 5 GiB"
  fi

  if ! grep -q 'tenant-imgproxy:' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" "$ref" <<'PY'
import sys
path, ref = sys.argv[1], sys.argv[2]
text = open(path).read()
if "tenant-imgproxy:" in text:
    sys.exit(0)
block = f"""
  tenant-imgproxy:
    image: darthsim/imgproxy:v3.30.1
    restart: unless-stopped
    volumes:
      - tenant-storage-{ref}:/var/lib/storage:Z
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: "true"
      IMGPROXY_MAX_SRC_RESOLUTION: "16.8"
    expose:
      - "5001"

"""
idx = text.find("  tenant-storage:")
if idx == -1:
    sys.exit(0)
open(path, "w").write(text[:idx] + block + text[idx:])
PY
    echo "  added tenant-imgproxy service"
  fi

  if grep -q 'tenant-storage:' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" "$ref" <<'PY'
import re, sys
path, ref = sys.argv[1], sys.argv[2]
text = open(path).read()
changed = False
if "supabase/storage-api:v1.23" in text:
    text = text.replace("supabase/storage-api:v1.23.0", "supabase/storage-api:v1.37.8")
    changed = True
if "ENABLE_IMAGE_TRANSFORMATION" not in text and "tenant-storage:" in text:
    insert = (
        f'      GLOBAL_S3_BUCKET: tenant-{ref}\n'
        '      ENABLE_IMAGE_TRANSFORMATION: "true"\n'
        '      IMGPROXY_URL: http://tenant-imgproxy:5001\n'
    )
    text, n = re.subn(
        r'(FILE_STORAGE_BACKEND_PATH: /var/lib/storage\n)',
        r'\1' + insert,
        text,
        count=1,
    )
    if n:
        changed = True
if "tenant-imgproxy" not in text.split("tenant-storage:")[1].split("tenant-realtime:")[0]:
    text, n = re.subn(
        r'(  tenant-storage:\n(?:.*\n)*?    depends_on:\n(?:      - .+\n)+)',
        r'\1      - tenant-imgproxy\n',
        text,
        count=1,
    )
    if n:
        changed = True
if changed:
    open(path, "w").write(text)
PY
    echo "  patched tenant-storage (imgproxy / v1.37.8 / GLOBAL_S3_BUCKET)"
  fi

  if grep -q 'tenant-storage:' "$dir/docker-compose.yml" 2>/dev/null && ! grep -q 'VECTOR_ENABLED:' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
insert = (
    '      VECTOR_ENABLED: "true"\n'
    '      VECTOR_BUCKET_PROVIDER: pgvector\n'
    '      VECTOR_STORE_MIGRATIONS_ENABLED: "true"\n'
)
text, n = re.subn(
    r'(IMGPROXY_URL: http://[^\n]+\n)',
    r'\1' + insert,
    text,
    count=1,
)
if n:
    open(path, "w").write(text)
    print("changed")
PY
    echo "  patched tenant-storage VECTOR env"
  fi

  # Shared tenant_data_plane network: generic tenant-imgproxy DNS hits another project's container.
  local imgproxy_host="tenant-imgproxy-${ref}"
  if grep -q 'IMGPROXY_URL: http://tenant-imgproxy:5001' "$dir/docker-compose.yml" 2>/dev/null; then
    sed -i "s|IMGPROXY_URL: http://tenant-imgproxy:5001|IMGPROXY_URL: http://${imgproxy_host}:5001|g" "$dir/docker-compose.yml"
    echo "  patched IMGPROXY_URL -> http://${imgproxy_host}:5001"
  fi
  if grep -q 'tenant-imgproxy:' "$dir/docker-compose.yml" 2>/dev/null; then
    python3 - "$dir/docker-compose.yml" "$imgproxy_host" <<'PY'
import re, sys
path, alias = sys.argv[1], sys.argv[2]
text = open(path).read()
if f"- {alias}" in text:
    sys.exit(0)
text, n = re.subn(
    r"(  tenant-imgproxy:\n(?:.*\n)*?    networks:\n)      - tenant_data_plane\n",
    rf"\1      tenant_data_plane:\n        aliases:\n          - {alias}\n",
    text,
    count=1,
)
if n:
    open(path, "w").write(text)
PY
    echo "  patched tenant-imgproxy network alias -> ${imgproxy_host}"
  fi

  traefik_dynamic="${TRAEFIK_DYNAMIC_DIR:-/etc/dokploy/traefik/dynamic}/tenant-${ref}.yml"
  if [[ -f "$traefik_dynamic" ]] && grep -q 'http://127.0.0.1:' "$traefik_dynamic" 2>/dev/null; then
    sed -i 's|http://127.0.0.1:|http://172.17.0.1:|g' "$traefik_dynamic"
    echo "  patched Traefik upstream -> 172.17.0.1"
  fi

  (cd "$dir" && docker compose up -d) >/dev/null

  local ready="f" i=0
  while [[ $i -lt 30 ]]; do
    ready=$(docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
      psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$dbname" -tAc \
      "select to_regclass('auth.users') is not null" 2>/dev/null || echo "f")
    [[ "$ready" == "t" ]] && break
    i=$((i + 1))
    sleep 3
  done

  if [[ "$ready" != "t" ]]; then
    echo "  WARN: auth.users not ready for $ref"
    return 1
  fi

  psql_admin "$dbname" "grant usage on schema auth to \"$tenant_role\""
  psql_admin "$dbname" "grant select on all tables in schema auth to \"$tenant_role\""
  psql_admin "$dbname" "alter default privileges in schema auth grant select on tables to \"$tenant_role\""

  psql_admin "$dbname" "grant usage on schema auth to postgres" || true
  psql_admin "$dbname" "grant references on all tables in schema auth to postgres" || true
  psql_admin "$dbname" "alter default privileges in schema auth grant references on tables to postgres" || true

  psql_admin "$dbname" "grant usage on schema public to anon, authenticated, service_role" || true
  psql_admin "$dbname" "grant select, insert, update, delete on all tables in schema public to anon, authenticated" || true
  psql_admin "$dbname" "grant all on all tables in schema public to service_role" || true
  psql_admin "$dbname" "alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated" || true
  psql_admin "$dbname" "notify pgrst, 'reload schema'" || true

  for ext_sql in \
    'create schema if not exists extensions' \
    'create extension if not exists pg_stat_statements with schema extensions' \
    'create extension if not exists hypopg with schema extensions' \
    'create extension if not exists index_advisor with schema extensions'; do
    psql_admin "$dbname" "$ext_sql" || true
  done

  echo "  ok: auth.users + grants + index-advisor extensions for $tenant_role"
}

for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  repair_ref "$ref" || true
done

TRAEFIK_DYNAMIC_DIR="${TRAEFIK_DYNAMIC_DIR:-/etc/dokploy/traefik/dynamic}"
REPO_ROOT="${REPO_ROOT:-/etc/dokploy/compose/indobase-backend-bmqhan/code}"
if [[ -f "$REPO_ROOT/docker/scripts/fix-tenant-traefik-from-docker.cjs" ]] && command -v node >/dev/null 2>&1; then
  echo ""
  echo "=== Normalize Traefik (stripPrefix + ports) ==="
  node "$REPO_ROOT/docker/scripts/fix-tenant-traefik-from-docker.cjs" "$TRAEFIK_DYNAMIC_DIR" || true
fi

echo ""
echo "=== Summary ==="
for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  dbname="tenantdb_${ref//-/_}"
  tenant_role="tenant_${ref//-/_}"
  auth=$(docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$dbname" -tAc \
    "select to_regclass('auth.users') is not null" 2>/dev/null || echo "?")
  priv=$(docker exec -e PGPASSWORD="$PG_ADMIN_PASSWORD" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_ADMIN_USER" -d "$dbname" -tAc \
    "select has_table_privilege('$tenant_role', 'auth.users', 'SELECT')" 2>/dev/null || echo "?")
  echo "$ref | auth.users=$auth | select=$priv"
done

echo ""
echo "=== Service health ==="
for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  (cd "$TENANTS_ROOT/$ref" && docker compose ps --format '{{.Service}}:{{.Status}}' 2>/dev/null) | tr '\n' ' '
  echo " ($ref)"
done

echo ""
echo "=== Public API probe (REST + Auth must not be 502/503) ==="
DOMAIN="${SAAS_PUBLIC_DOMAIN:-indobase.in}"
fail=0
for entry in "$TENANTS_ROOT"/*; do
  [[ -d "$entry" ]] || continue
  ref="$(basename "$entry")"
  [[ "$ref" == *.* ]] && continue
  host="${ref}.${DOMAIN}"
  rest=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' "https://${host}/rest/v1/" 2>/dev/null || echo err)
  auth=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' "https://${host}/auth/v1/health" 2>/dev/null || echo err)
  if [[ "$rest" =~ ^(502|503|000|err)$ || "$auth" =~ ^(502|503|000|err)$ ]]; then
    echo "FAIL $ref rest=$rest auth=$auth"
    fail=$((fail + 1))
  else
    echo "OK   $ref rest=$rest auth=$auth"
  fi
done
echo "probe_failures=$fail"
