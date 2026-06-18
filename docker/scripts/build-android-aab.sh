#!/usr/bin/env bash
# Android AAB build hook for project-mobile-build-executor.sh
#
# Env (from executor): INDOBASE_MOBILE_BUILD_JSON_FILE, INDOBASE_MOBILE_BUILD_RESULT_FILE, ...
# Optional: /etc/indobase/mobile-build.env with EAS_TOKEN, EXPO_TOKEN, ANDROID_KEYSTORE_* 
set -euo pipefail

if [[ -f /etc/indobase/mobile-build.env ]]; then
  # shellcheck disable=SC1091
  source /etc/indobase/mobile-build.env
fi

json_file="${INDOBASE_MOBILE_BUILD_JSON_FILE:?}"
result_file="${INDOBASE_MOBILE_BUILD_RESULT_FILE:?}"
project_ref="${INDOBASE_MOBILE_BUILD_PROJECT_REF:?}"
build_id="${INDOBASE_MOBILE_BUILD_ID:?}"

write_result() {
  python3 - "$result_file" "$1" "$2" <<'PY'
import json, sys
from pathlib import Path

out, status, message = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
payload = {
    "status": status,
    "log_message": message,
    "last_error": None if status == "ready" else message,
    "metadata_patch": {
        "executor_result": {
            "finished_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "ok": status == "ready",
        }
    },
    "artifacts": [],
}
if status == "ready" and len(sys.argv) > 4:
    artifact_json = sys.argv[4]
    if artifact_json:
        payload["artifacts"] = json.loads(artifact_json)
out.write_text(json.dumps(payload))
PY
}

framework="$(python3 - "$json_file" <<'PY'
import json, sys
from pathlib import Path
b = json.loads(Path(sys.argv[1]).read_text())
print(b.get("framework") or "expo")
PY
)"

work_dir="${INDOBASE_MOBILE_BUILD_WORK_DIR:-/var/lib/indobase/mobile-builds/${project_ref}/${build_id}}"
mkdir -p "$work_dir"

source_path="$(python3 - "$json_file" <<'PY'
import json, sys
from pathlib import Path
meta = json.loads(Path(sys.argv[1]).read_text()).get("metadata") or {}
for key in ("source_path", "workspace_path", "repo_path"):
    v = meta.get(key)
    if isinstance(v, str) and v.strip():
        print(v.strip())
        raise SystemExit(0)
print("")
PY
)"

if [[ -z "$source_path" || ! -d "$source_path" ]]; then
  write_result "$result_file" failed \
    "No mobile app source path in build metadata (metadata.source_path). Export the Expo project to the VPS or set INDOBASE_MOBILE_BUILD_WORK_DIR with a checked-out app before queueing builds."
  exit 0
fi

if [[ "$framework" != "expo" ]]; then
  write_result "$result_file" failed "Unsupported framework: ${framework}. Only expo is configured on this worker."
  exit 0
fi

eas_token="${EAS_TOKEN:-${EXPO_TOKEN:-}}"
if [[ -z "$eas_token" ]]; then
  write_result "$result_file" failed \
    "EAS_TOKEN (or EXPO_TOKEN) is not set. Add it to /etc/indobase/mobile-build.env on the VPS."
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  write_result "$result_file" failed "Node.js/npx is required on the VPS mobile build worker."
  exit 0
fi

export EAS_TOKEN="$eas_token"
export EXPO_TOKEN="$eas_token"
cd "$source_path"

profile="$(python3 - "$json_file" <<'PY'
import json, sys
from pathlib import Path
b = json.loads(Path(sys.argv[1]).read_text())
print(b.get("profile") or "production")
PY
)"

log_file="${INDOBASE_MOBILE_BUILD_LOG_FILE:-/dev/stderr}"
set +e
npx --yes eas-cli build --platform android --profile "$profile" --non-interactive --no-wait >>"$log_file" 2>&1
eas_exit=$?
set -e

if [[ "$eas_exit" -ne 0 ]]; then
  write_result "$result_file" failed "eas build failed (exit ${eas_exit}). See executor log for details."
  exit 0
fi

artifact_json='[{"kind":"android_aab","file_name":"app-release.aab","download_url":"","metadata":{"note":"EAS remote build submitted; poll EAS dashboard for artifact URL until webhook integration ships."}}]'
python3 - "$result_file" "ready" "EAS Android build submitted successfully" "$artifact_json" <<'PY'
import json, sys
from pathlib import Path

out, status, message, artifacts = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
payload = {
    "status": status,
    "log_message": message,
    "metadata_patch": {
        "executor_result": {
            "finished_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "ok": True,
            "provider": "eas",
        }
    },
    "artifacts": artifacts,
}
Path(out).write_text(json.dumps(payload))
PY

exit 0
