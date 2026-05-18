#!/usr/bin/env bash
# Platform database regression suite (CRUD, constraints, transactions, bulk, concurrency, indexes, JSONB).
# Run on VPS against a tenant DB:
#   TENANT_DB=tenantdb_adralll_hewtietesr bash docker/scripts/platform-db-regression-test.sh
#
# Optional:
#   DB_CONTAINER=indobase-db  PG_USER=postgres  ENV_FILE=/path/to/docker/.env
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env}"
DB_CONTAINER="${DB_CONTAINER:-indobase-db}"
PG_USER="${PG_USER:-postgres}"
TENANT_DB="${TENANT_DB:-tenantdb_adralll_hewtietesr}"
SCHEMA="platform_qa_$(date +%s)"

PASS=0
FAIL=0
SKIP=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

if [[ -f "$ENV_FILE" ]]; then
  PGPASS=$(grep -m1 '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')
else
  echo "Missing ENV_FILE=$ENV_FILE" >&2
  exit 1
fi

psql_run() {
  if [[ $# -eq 0 ]]; then
    docker exec -i -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
      psql -h 127.0.0.1 -U "$PG_USER" -d "$TENANT_DB" -v ON_ERROR_STOP=1 -f -
  else
    docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
      psql -h 127.0.0.1 -U "$PG_USER" -d "$TENANT_DB" -v ON_ERROR_STOP=1 "$@"
  fi
}

psql_quiet() {
  docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U "$PG_USER" -d "$TENANT_DB" -tAc "$1" 2>/dev/null
}

assert_ok() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    green "PASS  $name"
    PASS=$((PASS + 1))
  else
    red "FAIL  $name"
    FAIL=$((FAIL + 1))
  fi
}

assert_fail() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    red "FAIL  $name (expected error)"
    FAIL=$((FAIL + 1))
  else
    green "PASS  $name"
    PASS=$((PASS + 1))
  fi
}

section() {
  echo ""
  yellow "=== $1 ==="
}

section "Setup ($TENANT_DB / schema $SCHEMA)"
psql_run <<SQL
CREATE SCHEMA $SCHEMA;

CREATE TABLE ${SCHEMA}.parents (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL
);

CREATE TABLE ${SCHEMA}.children (
  id bigserial PRIMARY KEY,
  parent_id bigint NOT NULL REFERENCES ${SCHEMA}.parents(id) ON DELETE RESTRICT,
  amount integer NOT NULL DEFAULT 0
);

CREATE TABLE ${SCHEMA}.bulk_rows (
  id bigserial PRIMARY KEY,
  n integer NOT NULL,
  payload text
);

CREATE TABLE ${SCHEMA}.counter (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  value integer NOT NULL DEFAULT 0
);
INSERT INTO ${SCHEMA}.counter (id, value) VALUES (1, 0);

CREATE TABLE ${SCHEMA}.wide (
  id serial PRIMARY KEY,
  big_text text,
  meta jsonb
);

CREATE INDEX ${SCHEMA}_bulk_rows_n_idx ON ${SCHEMA}.bulk_rows (n);
SQL

section "CRUD"
psql_run -c "INSERT INTO ${SCHEMA}.parents (code, label) VALUES ('p1', 'Parent 1') RETURNING id;" >/dev/null
assert_ok "INSERT returns row" psql_run -c "SELECT 1 FROM ${SCHEMA}.parents WHERE code='p1';"
assert_ok "SELECT finds inserted row" test "$(psql_quiet "SELECT label FROM ${SCHEMA}.parents WHERE code='p1';" | tr -d '[:space:]')" = "Parent1"
psql_run -c "UPDATE ${SCHEMA}.parents SET label='Parent One' WHERE code='p1';" >/dev/null
assert_ok "UPDATE changes row" test "$(psql_quiet "SELECT label FROM ${SCHEMA}.parents WHERE code='p1';" | tr -d '[:space:]')" = "ParentOne"
psql_run -c "INSERT INTO ${SCHEMA}.children (parent_id, amount) SELECT id, 10 FROM ${SCHEMA}.parents WHERE code='p1';" >/dev/null
assert_ok "INSERT child" test "$(psql_quiet "SELECT count(*)::int FROM ${SCHEMA}.children;")" -eq 1
psql_run -c "DELETE FROM ${SCHEMA}.children;" >/dev/null
psql_run -c "DELETE FROM ${SCHEMA}.parents WHERE code='p1';" >/dev/null
assert_ok "DELETE removes rows" test "$(psql_quiet "SELECT count(*)::int FROM ${SCHEMA}.parents;")" -eq 0

section "Transactions (commit / rollback)"
psql_run <<SQL
BEGIN;
INSERT INTO ${SCHEMA}.parents (code, label) VALUES ('tx1', 'tx');
ROLLBACK;
SQL
assert_ok "ROLLBACK discards insert" test "$(psql_quiet "SELECT count(*)::int FROM ${SCHEMA}.parents WHERE code='tx1';")" -eq 0

psql_run <<SQL
BEGIN;
INSERT INTO ${SCHEMA}.parents (code, label) VALUES ('tx2', 'committed');
COMMIT;
SQL
assert_ok "COMMIT persists insert" test "$(psql_quiet "SELECT count(*)::int FROM ${SCHEMA}.parents WHERE code='tx2';")" -eq 1

section "Foreign keys"
psql_run -c "INSERT INTO ${SCHEMA}.parents (code, label) VALUES ('fk_p', 'fk');" >/dev/null
parent_id=$(psql_quiet "SELECT id FROM ${SCHEMA}.parents WHERE code='fk_p';")
assert_fail "FK blocks orphan child" psql_run -c "INSERT INTO ${SCHEMA}.children (parent_id, amount) VALUES (999999999, 1);"
psql_run -c "INSERT INTO ${SCHEMA}.children (parent_id, amount) VALUES ($parent_id, 1);" >/dev/null
assert_fail "FK blocks parent delete with child" psql_run -c "DELETE FROM ${SCHEMA}.parents WHERE id=$parent_id;"
psql_run -c "DELETE FROM ${SCHEMA}.children WHERE parent_id=$parent_id;" >/dev/null
psql_run -c "DELETE FROM ${SCHEMA}.parents WHERE id=$parent_id;" >/dev/null
assert_ok "DELETE parent after child removed" test "$(psql_quiet "SELECT count(*)::int FROM ${SCHEMA}.parents WHERE code='fk_p';")" -eq 0

section "UNIQUE and NOT NULL"
assert_fail "NOT NULL enforced" psql_run -c "INSERT INTO ${SCHEMA}.parents (code, label) VALUES (NULL, 'x');"
psql_run -c "INSERT INTO ${SCHEMA}.parents (code, label) VALUES ('uniq', 'u');" >/dev/null
assert_fail "UNIQUE enforced" psql_run -c "INSERT INTO ${SCHEMA}.parents (code, label) VALUES ('uniq', 'u2');"
psql_run -c "DELETE FROM ${SCHEMA}.parents WHERE code='uniq';" >/dev/null

section "Bulk inserts"
bulk_test() {
  local n="$1"
  local max_sec="$2"
  psql_run -c "TRUNCATE ${SCHEMA}.bulk_rows;" >/dev/null
  local start end elapsed
  start=$(date +%s)
  psql_run -c "INSERT INTO ${SCHEMA}.bulk_rows (n) SELECT g FROM generate_series(1, $n) g;" >/dev/null
  end=$(date +%s)
  elapsed=$((end - start))
  local cnt
  cnt=$(psql_quiet "SELECT count(*)::int FROM ${SCHEMA}.bulk_rows;")
  if [[ "$cnt" -eq "$n" && "$elapsed" -le "$max_sec" ]]; then
    green "PASS  bulk insert ${n} rows in ${elapsed}s (limit ${max_sec}s)"
    PASS=$((PASS + 1))
  else
    red "FAIL  bulk insert ${n}: count=$cnt elapsed=${elapsed}s limit=${max_sec}s"
    FAIL=$((FAIL + 1))
  fi
}
bulk_test 1000 30
bulk_test 10000 120
bulk_test 100000 600

section "Index usage (EXPLAIN)"
plan=$(psql_quiet "EXPLAIN (FORMAT TEXT) SELECT * FROM ${SCHEMA}.bulk_rows WHERE n = 50000;")
if echo "$plan" | grep -qi 'Index Scan'; then
  green "PASS  EXPLAIN uses Index Scan for indexed column"
  PASS=$((PASS + 1))
else
  red "FAIL  EXPLAIN plan (expected Index Scan): $plan"
  FAIL=$((FAIL + 1))
fi

section "Large TEXT and JSONB"
psql_run <<SQL
INSERT INTO ${SCHEMA}.wide (big_text, meta)
VALUES (
  repeat('x', 500000),
  '{"nested":{"arr":[1,2,3],"tags":["a","b"],"big":true}}'::jsonb
);
SQL
text_len=$(psql_quiet "SELECT length(big_text) FROM ${SCHEMA}.wide LIMIT 1;" | tr -d '[:space:]')
json_ok=$(psql_quiet "SELECT (meta #>> '{nested,big}') FROM ${SCHEMA}.wide LIMIT 1;" | tr -d '[:space:]')
arr_len=$(psql_quiet "SELECT jsonb_array_length(meta->'nested'->'arr') FROM ${SCHEMA}.wide LIMIT 1;" | tr -d '[:space:]')
if [[ "$text_len" -eq 500000 && "$json_ok" == "true" && "$arr_len" == "3" ]]; then
  green "PASS  large text (${text_len} chars) and JSONB round-trip"
  PASS=$((PASS + 1))
else
  red "FAIL  wide column check text_len=$text_len json=$json_ok"
  FAIL=$((FAIL + 1))
fi

section "Concurrent writes (10 workers x 100 increments)"
psql_run -c "UPDATE ${SCHEMA}.counter SET value = 0 WHERE id = 1;" >/dev/null
TMPDIR="${TMPDIR:-/tmp}/platform-qa-$$"
mkdir -p "$TMPDIR"
for w in $(seq 1 10); do
  (
    for i in $(seq 1 100); do
      docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
        psql -h 127.0.0.1 -U "$PG_USER" -d "$TENANT_DB" -c \
        "UPDATE ${SCHEMA}.counter SET value = value + 1 WHERE id = 1;" >/dev/null 2>&1 || exit 1
    done
  ) &
done
wait_fail=0
for job in $(jobs -p); do
  wait "$job" || wait_fail=1
done
final=$(psql_quiet "SELECT value FROM ${SCHEMA}.counter WHERE id = 1;")
if [[ "$wait_fail" -eq 0 && "$final" -eq 1000 ]]; then
  green "PASS  concurrent increments (final=$final, expected=1000)"
  PASS=$((PASS + 1))
else
  red "FAIL  concurrent increments (final=$final, expected=1000, wait_fail=$wait_fail)"
  FAIL=$((FAIL + 1))
fi
rm -rf "$TMPDIR"

section "Cleanup"
psql_run -c "DROP SCHEMA ${SCHEMA} CASCADE;" >/dev/null

echo ""
yellow "=== Summary ==="
echo "Database: $TENANT_DB"
green "Passed: $PASS"
[[ "$FAIL" -gt 0 ]] && red "Failed: $FAIL" || echo "Failed: $FAIL"
[[ "$SKIP" -gt 0 ]] && yellow "Skipped: $SKIP"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
