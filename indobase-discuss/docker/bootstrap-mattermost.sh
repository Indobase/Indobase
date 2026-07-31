#!/bin/sh
# Ensure a system-admin personal access token exists for the Discuss SSO bridge.
# Idempotent: reuses /secrets/admin_token when present and still valid.
set -eu

MM_URL="${MATTERMOST_URL:-http://discuss-mattermost:8065}"
ADMIN_EMAIL="${MATTERMOST_ADMIN_EMAIL:-discuss-admin@indobase.local}"
ADMIN_USER="${MATTERMOST_ADMIN_USERNAME:-ibdiscuss}"
ADMIN_PASS="${MATTERMOST_ADMIN_PASSWORD:?MATTERMOST_ADMIN_PASSWORD required}"
TOKEN_FILE="${TOKEN_FILE:-/secrets/admin_token}"

mkdir -p "$(dirname "$TOKEN_FILE")"

log() { echo "[discuss-bootstrap] $*"; }

wait_ping() {
  i=0
  while [ "$i" -lt 90 ]; do
    if curl -fsS "$MM_URL/api/v4/system/ping" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  log "Mattermost did not become ready"
  exit 1
}

api() {
  method="$1"
  path="$2"
  shift 2
  curl -fsS -X "$method" "$MM_URL$path" \
    -H "Content-Type: application/json" \
    "$@"
}

token_ok() {
  tok="$1"
  [ -n "$tok" ] || return 1
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $tok" \
    "$MM_URL/api/v4/users/me" || true)
  [ "$code" = "200" ]
}

wait_ping

apply_indobase_brand() {
  pat="$1"
  # Compact CustomBrand PNG + patch support links in persisted config.
  # Env overrides cover most settings at runtime; PrivacyPolicyLink historically
  # missed because of a wrong MM_* key. Use /config/patch (partial).
  BRAND_IMG="${INDOBASE_CUSTOM_BRAND_IMAGE:-/brand/indobase-custom-brand.png}"
  if [ -f "$BRAND_IMG" ]; then
    code=$(curl -sS -o /tmp/mm-brand.out -w "%{http_code}" -X POST "$MM_URL/api/v4/brand/image" \
      -H "Authorization: Bearer $pat" \
      -F "image=@${BRAND_IMG};type=image/png" || true)
    if [ "$code" = "201" ] || [ "$code" = "200" ]; then
      log "uploaded Indobase CustomBrand image ($code)"
    else
      log "CustomBrand upload skipped/failed (HTTP ${code:-?}): $(cat /tmp/mm-brand.out 2>/dev/null | head -c 200)"
    fi
  else
    log "no CustomBrand image at $BRAND_IMG — CSS injection still covers chrome"
  fi

  patch_body='{
  "TeamSettings": {
    "SiteName": "Indobase Discuss",
    "EnableCustomBrand": true,
    "CustomBrandText": "Indobase Discuss — team chat for your organization and project",
    "CustomDescriptionText": "Team chat for your Indobase organization and project"
  },
  "SupportSettings": {
    "AboutLink": "https://studio.indobase.in",
    "HelpLink": "https://studio.indobase.in",
    "PrivacyPolicyLink": "https://indobase.in/privacy",
    "TermsOfServiceLink": "https://indobase.in/terms",
    "SupportEmail": "support@indobase.in",
    "ReportAProblemLink": "",
    "EnableAskCommunityLink": false
  },
  "NativeAppSettings": {
    "AppDownloadLink": "",
    "AndroidAppDownloadLink": "",
    "IosAppDownloadLink": ""
  },
  "EmailSettings": {
    "EnablePreviewModeBanner": false
  },
  "ServiceSettings": {
    "EnableDesktopLandingPage": false,
    "EnableOnboardingFlow": false,
    "EnableTutorial": false
  },
  "AnnouncementSettings": {
    "UserNoticesEnabled": false,
    "AdminNoticesEnabled": false
  },
  "LogSettings": {
    "EnableDiagnostics": false
  },
  "PluginSettings": {
    "EnableMarketplace": false,
    "EnableRemoteMarketplace": false,
    "PluginStates": {
      "com.mattermost.nps": { "Enable": false },
      "playbooks": { "Enable": false },
      "com.mattermost.calls": { "Enable": true }
    }
  }
}'
  # Why each of the above (debranding + infra banners, spec §1/§2):
  #   ReportAProblemLink ""        — default points at mattermost.com/pl/report-a-bug.
  #   EnableAskCommunityLink       — Help menu link to the Mattermost community.
  #   EnablePreviewModeBanner      — "Preview Mode: Email notifications have not been
  #                                  configured" bar (we ship SENDEMAILNOTIFICATIONS=false
  #                                  on purpose). Config, not CSS: blanket-hiding
  #                                  .announcement-bar would also kill legitimate bars.
  #   EnableDesktopLandingPage     — /landing interstitial ("Opening link in Mattermost…")
  #                                  whose download CTA is dead (AppDownloadLink is empty).
  #   EnableOnboardingFlow/Tutorial— "Welcome to Mattermost" tour + task list.
  #   User/AdminNoticesEnabled     — "Notice from Mattermost" modals fetched upstream.
  #   EnableDiagnostics            — RudderStack telemetry + the NPS survey bot that DMs
  #                                  users asking how likely they are to recommend
  #                                  Mattermost. No user-facing feature is lost.
  #   PluginStates                 — NPS off, Playbooks off (a second Mattermost-branded
  #                                  product in the switcher). Calls stays ON: disabling
  #                                  it would remove a user-facing button.
  #   EnableMarketplace/Remote     — the Mattermost plugin store.
  put=$(curl -sS -o /tmp/mm-cfg.out -w "%{http_code}" -X PUT "$MM_URL/api/v4/config/patch" \
    -H "Authorization: Bearer $pat" \
    -H "Content-Type: application/json" \
    -d "$patch_body" || true)
  if [ "$put" = "200" ]; then
    log "patched SiteName / support links / CustomBrand via config/patch"
  else
    log "config/patch HTTP ${put:-?} (env overrides still apply): $(head -c 240 /tmp/mm-cfg.out 2>/dev/null)"
  fi
}

# ── Project-first channels ───────────────────────────────────────────────────
# Every new team is seeded upstream with "Town Square" and "Off-Topic". Both read
# as the upstream product, so each team is reshaped into a real workspace:
# General / Announcements / Support / Development / Design / Marketing.
#
# Slugs are deep links. `town-square` keeps its slug forever (the server hardcodes
# it as the team default channel for join/leave/permission logic) — only its
# display_name moves. Off-Topic is archived while it is still empty, and merely
# relabelled once it holds messages, so no conversation is ever hidden.
#
# The bridge applies the same plan to teams it creates
# (bridge/src/channel-plan.ts); this pass retrofits teams that already exist.
# bridge/src/channel-plan.test.ts asserts the two lists stay identical — keep the
# `slug|Display Name|Purpose` format and single quotes if you edit them.
INDOBASE_GENERAL_DISPLAY='General'
INDOBASE_OFF_TOPIC_DISPLAY='Random'
INDOBASE_TEAM_CHANNELS='announcements|Announcements|Product and company announcements
support|Support|Questions, requests and help
development|Development|Engineering work, builds and releases
design|Design|Product, brand and interface design
marketing|Marketing|Campaigns, content and growth'

HTTP_CODE=''

# Prints the body, sets HTTP_CODE. Never fails the script (curl errors → 000).
mm_api() {
  _pat="$1"
  _method="$2"
  _path="$3"
  if [ "$#" -ge 4 ]; then
    HTTP_CODE=$(curl -sS -o /tmp/mm-api.out -w '%{http_code}' -X "$_method" "$MM_URL$_path" \
      -H "Authorization: Bearer $_pat" -H 'Content-Type: application/json' -d "$4" || echo 000)
  else
    HTTP_CODE=$(curl -sS -o /tmp/mm-api.out -w '%{http_code}' -X "$_method" "$MM_URL$_path" \
      -H "Authorization: Bearer $_pat" -H 'Content-Type: application/json' || echo 000)
  fi
  cat /tmp/mm-api.out 2>/dev/null || true
}

# Field readers. `"id":"…"` is unambiguous because every other id field is
# suffixed (team_id, scheme_id) — the leading quote only matches the real key.
json_str() { printf '%s' "$1" | sed -n "s/.*[,{]\"$2\":\"\([^\"]*\)\".*/\1/p" | head -1; }
json_num() { printf '%s' "$1" | sed -n "s/.*[,{]\"$2\":\([0-9][0-9]*\).*/\1/p" | head -1; }

ensure_team_channels() {
  pat="$1"
  team_id="$2"

  # town-square → General. display_name only; the slug is load-bearing.
  ts=$(mm_api "$pat" GET "/api/v4/teams/$team_id/channels/name/town-square")
  if [ "$HTTP_CODE" = "200" ]; then
    ts_id=$(json_str "$ts" id)
    ts_name=$(json_str "$ts" display_name)
    # Only replace the upstream label — an admin's own rename wins.
    if [ -n "$ts_id" ] && { [ "$ts_name" = "Town Square" ] || [ -z "$ts_name" ]; }; then
      mm_api "$pat" PUT "/api/v4/channels/$ts_id/patch" \
        "{\"display_name\":\"$INDOBASE_GENERAL_DISPLAY\"}" >/dev/null
      log "team $team_id: town-square labelled '$INDOBASE_GENERAL_DISPLAY' (HTTP $HTTP_CODE)"
    fi
  fi

  # off-topic → archived while empty, relabelled once it holds messages.
  ot=$(mm_api "$pat" GET "/api/v4/teams/$team_id/channels/name/off-topic")
  if [ "$HTTP_CODE" = "200" ]; then
    ot_id=$(json_str "$ot" id)
    ot_name=$(json_str "$ot" display_name)
    ot_msgs=$(json_num "$ot" total_msg_count)
    [ -n "$ot_msgs" ] || ot_msgs=1
    if [ -n "$ot_id" ] && { [ "$ot_name" = "Off-Topic" ] || [ -z "$ot_name" ]; }; then
      if [ "$ot_msgs" = "0" ]; then
        mm_api "$pat" DELETE "/api/v4/channels/$ot_id" >/dev/null
        log "team $team_id: archived empty off-topic (HTTP $HTTP_CODE)"
      else
        mm_api "$pat" PUT "/api/v4/channels/$ot_id/patch" \
          "{\"display_name\":\"$INDOBASE_OFF_TOPIC_DISPLAY\"}" >/dev/null
        log "team $team_id: off-topic labelled '$INDOBASE_OFF_TOPIC_DISPLAY' (HTTP $HTTP_CODE)"
      fi
    fi
  fi

  # The rest of the workspace. Public (type O) so members can find them.
  printf '%s\n' "$INDOBASE_TEAM_CHANNELS" | while IFS='|' read -r slug display purpose; do
    if [ -z "$slug" ]; then
      continue
    fi
    mm_api "$pat" GET "/api/v4/teams/$team_id/channels/name/$slug" >/dev/null
    if [ "$HTTP_CODE" = "200" ]; then
      continue
    fi
    mm_api "$pat" POST "/api/v4/channels" \
      "{\"team_id\":\"$team_id\",\"name\":\"$slug\",\"display_name\":\"$display\",\"purpose\":\"$purpose\",\"type\":\"O\"}" >/dev/null
    case "$HTTP_CODE" in
      200 | 201) log "team $team_id: created #$slug ($display)" ;;
      *) log "team $team_id: could not create #$slug (HTTP $HTTP_CODE)" ;;
    esac
  done
}

apply_channel_plan() {
  pat="$1"

  # Add every member of a team to the workspace channels on join. Channels that
  # do not exist are ignored server-side, so this is safe before they are created.
  join_list=$(printf '%s\n' "$INDOBASE_TEAM_CHANNELS" |
    awk -F'|' 'NF>0 && $1 != "" {printf "%s\"%s\"", sep, $1; sep=","}')
  mm_api "$pat" PUT "/api/v4/config/patch" \
    "{\"TeamSettings\":{\"ExperimentalDefaultChannels\":[$join_list]}}" >/dev/null
  log "default join channels patched (HTTP $HTTP_CODE)"

  page=0
  while [ "$page" -lt 20 ]; do
    teams=$(mm_api "$pat" GET "/api/v4/teams?page=$page&per_page=100")
    if [ "$HTTP_CODE" != "200" ]; then
      log "team list unavailable (HTTP $HTTP_CODE) — channel plan skipped"
      return 0
    fi
    ids=$(printf '%s' "$teams" | tr '}' '\n' |
      sed -n 's/.*[,{]"id":"\([a-z0-9]\{26\}\)".*/\1/p')
    if [ -z "$ids" ]; then
      break
    fi
    for tid in $ids; do
      ensure_team_channels "$pat" "$tid"
    done
    page=$((page + 1))
  done
}

if [ -f "$TOKEN_FILE" ]; then
  existing=$(tr -d '[:space:]' <"$TOKEN_FILE" || true)
  if token_ok "$existing"; then
    log "existing admin token is valid"
    apply_indobase_brand "$existing"
    apply_channel_plan "$existing"
    # Keep container alive so depends_on service_started is stable; sleep forever.
    exec sleep infinity
  fi
  log "stale token — recreating"
fi

# Login or create first admin (open signup is disabled after first user exists).
login_json=$(curl -sS -X POST "$MM_URL/api/v4/users/login" \
  -H "Content-Type: application/json" \
  -D /tmp/mm-login.hdr \
  -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" || true)

session=$(awk -F': ' 'tolower($1)=="token" {gsub(/\r/,"",$2); print $2; exit}' /tmp/mm-login.hdr 2>/dev/null || true)

if [ -z "$session" ]; then
  log "admin login failed — creating user $ADMIN_EMAIL"
  create=$(curl -sS -w "\n%{http_code}" -X POST "$MM_URL/api/v4/users" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" || true)
  code=$(printf '%s\n' "$create" | tail -n1)
  if [ "$code" != "201" ] && [ "$code" != "200" ]; then
    log "create user failed (HTTP $code): $(printf '%s\n' "$create" | sed '$d')"
    SOCKET="${MM_LOCAL_SOCKET:-/var/tmp/mattermost_local.socket}"
    if [ -S "$SOCKET" ] && [ -x /mattermost/bin/mmctl ]; then
      log "creating admin via mmctl --local (signup disabled)"
      /mattermost/bin/mmctl --local --local-socket-path "$SOCKET" user create \
        --email "$ADMIN_EMAIL" \
        --username "$ADMIN_USER" \
        --password "$ADMIN_PASS" \
        --system-admin \
        --email-verified >/dev/null || true
    fi
    # Retry login in case create succeeded (API or mmctl).
    curl -sS -X POST "$MM_URL/api/v4/users/login" \
      -H "Content-Type: application/json" \
      -D /tmp/mm-login.hdr \
      -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" >/dev/null || true
    session=$(awk -F': ' 'tolower($1)=="token" {gsub(/\r/,"",$2); print $2; exit}' /tmp/mm-login.hdr 2>/dev/null || true)
  else
    curl -sS -X POST "$MM_URL/api/v4/users/login" \
      -H "Content-Type: application/json" \
      -D /tmp/mm-login.hdr \
      -d "{\"login_id\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" >/dev/null
    session=$(awk -F': ' 'tolower($1)=="token" {gsub(/\r/,"",$2); print $2; exit}' /tmp/mm-login.hdr 2>/dev/null || true)
  fi
fi

if [ -z "$session" ]; then
  log "could not obtain session for admin"
  exit 1
fi

user_id=$(curl -fsS -H "Authorization: Bearer $session" "$MM_URL/api/v4/users/me" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
if [ -z "$user_id" ]; then
  log "could not resolve admin user id"
  exit 1
fi

# Promote to system admin (no-op if already).
curl -fsS -X PUT "$MM_URL/api/v4/users/$user_id/roles" \
  -H "Authorization: Bearer $session" \
  -H "Content-Type: application/json" \
  -d '{"roles":"system_admin system_user"}' >/dev/null || true

# Personal access tokens require the permission; enable via config patch if needed.
tok_body=$(curl -sS -X POST "$MM_URL/api/v4/users/$user_id/tokens" \
  -H "Authorization: Bearer $session" \
  -H "Content-Type: application/json" \
  -d '{"description":"indobase-discuss-bridge"}')

pat=$(printf '%s' "$tok_body" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
if [ -z "$pat" ]; then
  log "PAT create failed: $tok_body"
  # Fall back to session token (expires) so bridge can still boot for smoke.
  pat="$session"
  log "falling back to session token (rotate via MATTERMOST_ADMIN_TOKEN later)"
fi

umask 077
printf '%s' "$pat" >"$TOKEN_FILE"
log "wrote admin token to $TOKEN_FILE"

apply_indobase_brand "$pat"
apply_channel_plan "$pat"

exec sleep infinity
