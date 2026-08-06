#!/usr/bin/env bash
# Mint a local SSO URL for the CFOS bridge without Studio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET="${BUILDER_CFOS_HANDOFF_SECRET:-${BUILDER_HANDOFF_SECRET:-}}"
BASE="${BUILDER_CFOS_APP_URL:-http://127.0.0.1:8791}"

if [[ ${#SECRET} -lt 32 ]]; then
  SECRET="$(python3 -c 'print("poc-" + "x"*29)')"
  echo "Using ephemeral secret (export this on the bridge too):" >&2
  echo "  export BUILDER_CFOS_HANDOFF_SECRET='$SECRET'" >&2
fi

TOKEN="$(
  SECRET="$SECRET" node --input-type=module <<'NODE'
import crypto from 'node:crypto'
const secret = process.env.SECRET
const now = Math.floor(Date.now() / 1000)
const projectRef = 'local_poc'
const payload = {
  aud: 'indobase-builder-cfos',
  email: 'poc@indobase.in',
  exp: now + 60 * 30,
  iat: now,
  iss: 'https://studio.indobase.in',
  organization_slug: 'poc',
  project_name: 'Local PoC',
  project_ref: projectRef,
  projectRef,
  studio_url: 'https://studio.indobase.in',
  sub: 'local-poc-user',
  userId: 'local-poc-user',
  backend: {
    anon_key: 'poc-anon-key',
    api_url: `https://${projectRef}.indobase.in`,
    auth_url: `https://${projectRef}.indobase.in/auth/v1`,
    project_name: 'Local PoC',
    project_ref: projectRef,
    project_url: `https://studio.indobase.in/project/${projectRef}/backend`,
    rest_url: `https://${projectRef}.indobase.in/rest/v1/`,
    storage_url: `https://${projectRef}.indobase.in/storage/v1`,
  },
}
const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v))
  .toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`
const sig = crypto.createHmac('sha256', secret).update(data).digest()
  .toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
process.stdout.write(`${data}.${sig}`)
NODE
)"

URL="${BASE%/}/sso/launch?project_ref=local_poc&next=%2F#token=${TOKEN}"
echo "$URL"
