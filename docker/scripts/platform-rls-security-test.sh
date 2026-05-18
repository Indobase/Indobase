#!/usr/bin/env bash
# Platform RLS security regression (saas control-plane on shared postgres).
# Run on VPS:
#   bash docker/scripts/platform-rls-security-test.sh
#
# Optional:
#   ENV_FILE=/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env
#   DB_CONTAINER=indobase-db
#   PG_DATABASE=postgres
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
DB_CONTAINER="${DB_CONTAINER:-indobase-db}"
PG_DATABASE="${PG_DATABASE:-postgres}"
PG_USER="${PG_USER:-postgres}"

PASS_COUNT=0
FAIL=0
SKIP=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
skip() { yellow "SKIP  $1"; SKIP=$((SKIP + 1)); }

assert_ok() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    green "PASS  $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    red "FAIL  $name"
    FAIL=$((FAIL + 1))
  fi
}

assert_fail() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    red "FAIL  $name (expected denial)"
    FAIL=$((FAIL + 1))
  else
    green "PASS  $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ENV_FILE=$ENV_FILE" >&2
  exit 1
fi

PGPASS=$(grep -m1 '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')

psql_run() {
  docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 "$@"
}

psql_scalar() {
  docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_USER" -d "$PG_DATABASE" -tAc "$1" | tr -d '\r' \
    | awk '$0 ~ /^-?[0-9]+$/ || $0 ~ /^[0-9a-f-]{36}$/i || $0 ~ /^[\[{]/ { line = $0 } END { print line }'
}

as_user_scalar() {
  local uid="$1"
  local sql="$2"
  psql_scalar "begin; set local role authenticated; select set_config('app.uid', '${uid}', true); ${sql}; rollback;"
}

section() {
  echo ""
  yellow "=== $1 ==="
}

# Pick two users in different orgs (not shared membership).
mapfile -t USER_PAIR < <(psql_scalar "
  select a.gotrue_id || '|' || b.gotrue_id
  from saas.organization_members a
  join saas.organization_members b on b.organization_id <> a.organization_id
    and b.gotrue_id <> a.gotrue_id
  limit 1;
")
if [[ ${#USER_PAIR[@]} -eq 0 || -z "${USER_PAIR[0]}" ]]; then
  red "Need at least two users in different organizations to run RLS tests." >&2
  exit 1
fi
USER_A="${USER_PAIR[0]%%|*}"
USER_B="${USER_PAIR[0]##*|}"

ORG_B=$(psql_scalar "select organization_id from saas.organization_members where gotrue_id = '$USER_B' limit 1;")
PROJECT_B=$(psql_scalar "select ref from saas.projects where organization_id = $ORG_B order by id limit 1;")
if [[ -z "$PROJECT_B" ]]; then
  PROJECT_B=$(psql_scalar "select p.ref from saas.projects p join saas.organization_members m on m.organization_id = p.organization_id where m.gotrue_id = '$USER_B' order by p.id limit 1;")
fi
DELETED_USER="00000000-0000-4000-8000-000000000099"

section "Setup (user A=$USER_A, user B=$USER_B, org B=$ORG_B)"
TOTAL_ORGS=$(psql_scalar "select count(*) from saas.organizations;")
TOTAL_PROJECTS=$(psql_scalar "select count(*) from saas.projects;")

section "Unauthenticated / default deny"
assert_ok "authenticated with empty app.uid sees zero orgs" \
  test "$(as_user_scalar "" "select count(*)::text from saas.organizations")" = "0"

assert_ok "authenticated with empty app.uid sees zero projects" \
  test "$(as_user_scalar "" "select count(*)::text from saas.projects")" = "0"

assert_fail "anon cannot read saas.organizations" \
  psql_scalar "begin; set local role anon; select count(*) from saas.organizations; rollback;"

section "User A vs User B isolation"
ORGS_A=$(as_user_scalar "$USER_A" "select count(*)::text from saas.organizations")
ORGS_B=$(as_user_scalar "$USER_B" "select count(*)::text from saas.organizations")
assert_ok "user A sees fewer orgs than service_role" test "$ORGS_A" -lt "$TOTAL_ORGS"
assert_ok "user B sees fewer orgs than service_role" test "$ORGS_B" -lt "$TOTAL_ORGS"

CROSS=$(as_user_scalar "$USER_A" "select count(*)::text from saas.organizations where id = $ORG_B")
assert_ok "user A cannot read user B org row" test "$CROSS" = "0"

CROSS_P=$(as_user_scalar "$USER_A" "select count(*)::text from saas.projects where organization_id = $ORG_B")
assert_ok "user A cannot read user B projects" test "$CROSS_P" = "0"

MUT=$(as_user_scalar "$USER_A" "with u as (update saas.projects set name = name where organization_id = $ORG_B returning id) select count(*)::text from u" 2>/dev/null || echo "err")
assert_ok "user A cannot mutate user B projects" test "$MUT" = "0"

section "Admin (service_role) bypasses RLS; authenticated does not"
ADMIN_ORGS=$(psql_scalar "begin; set local role service_role; select count(*)::text from saas.organizations; rollback;")
assert_ok "service_role sees all organizations" test "$ADMIN_ORGS" = "$TOTAL_ORGS"

AUTH_ORGS="$ORGS_A"
assert_ok "authenticated does not see all organizations" test "$AUTH_ORGS" -lt "$ADMIN_ORGS"

section "Custom policy: project team membership (custom_domains)"
if [[ -n "$PROJECT_B" ]]; then
  HOST="rls-qa-$(date +%s).invalid"
  INS=$(psql_scalar "
    begin;
    set local role authenticated;
    select set_config('app.uid', '$USER_B', true);
    insert into saas.custom_domains (project_ref, hostname) values ('$PROJECT_B', '$HOST');
    select id::text from saas.custom_domains where hostname = '$HOST';
    rollback;
  " 2>/dev/null || echo "")
  assert_ok "member can insert custom_domain for own project" test -n "$INS"

  DENY=$(psql_scalar "
    begin;
    set local role authenticated;
    select set_config('app.uid', '$USER_A', true);
    insert into saas.custom_domains (project_ref, hostname) values ('$PROJECT_B', 'deny-$HOST');
    select 1;
    rollback;
  " 2>/dev/null || echo "err")
  assert_ok "non-member cannot insert into B project" test "$DENY" != "1"

  READ_A=$(as_user_scalar "$USER_A" "select count(*)::text from saas.custom_domains where project_ref = '$PROJECT_B'")
  assert_ok "non-member cannot read B custom_domains" test "$READ_A" = "0"
else
  skip "custom_domains team policy (no project for user B)"
fi

section "Edge cases: null scope, deleted user"
ORPHAN=$(as_user_scalar "$USER_B" "select count(*)::text from saas.audit_logs where organization_id is null and project_ref is null")
assert_ok "orphan audit_logs (null org/project) not visible" test "$ORPHAN" = "0"

DELETED_ORGS=$(as_user_scalar "$DELETED_USER" "select count(*)::text from saas.organizations")
assert_ok "deleted/non-member user sees zero orgs" test "$DELETED_ORGS" = "0"

section "RLS query plan (no per-row membership N+1)"
INITPLANS=$(docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
  psql -h 127.0.0.1 -U "$PG_USER" -d "$PG_DATABASE" -c \
  "begin; set local role authenticated; select set_config('app.uid', '$USER_A', true); explain select id from saas.projects limit 50; rollback;" 2>/dev/null \
  | grep -c 'InitPlan' || true)
assert_ok "projects RLS plan has no InitPlan subqueries" test "${INITPLANS:-0}" -eq 0

echo ""
yellow "=== Summary ==="
green "PASS: $PASS_COUNT"
[[ "$FAIL" -gt 0 ]] && red "FAIL: $FAIL" || echo "FAIL: $FAIL"
yellow "SKIP: $SKIP"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
