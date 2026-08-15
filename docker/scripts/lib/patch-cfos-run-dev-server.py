#!/usr/bin/env python3
"""
Patch Cloudflare OS run-dev-server.js for Indobase production durability.

Wrangler exits when a Durable Object throws an uncaught error (empty ERROR /
"Network connection lost" / access revoked). Upstream run-dev-server then
process.exit()'s, which takes down :8787 and forces a 2–4 min cold restart
(gatekeeper vite builds) — blanking Builder UI (502 JSON as CSS).

This patch:
  1. Keeps INDOBASE_WRANGLER_IP bind support (0.0.0.0 for Docker host-gateway).
  2. Restarts wrangler in-process on non-signal exits so gatekeeper watchers
     stay warm and :8787 returns in seconds instead of minutes.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

DEFAULT_PATH = Path("/opt/indobase-cfos-runtime/cloudflare-os/run-dev-server.js")

MARKER = "[indobase] Restarting wrangler (attempt"

NEW_BLOCK = '''if (process.env.INDOBASE_WRANGLER_IP) {
  args.push("--ip", process.env.INDOBASE_WRANGLER_IP);
}

// Indobase: wrangler/workerd exits on uncaught DO errors during agent.run.
// Restart in-place so gatekeeper vite watchers stay warm (:8787 recovers in
// seconds instead of a full systemd cold start).
const indobaseWranglerRestartMs = Number(process.env.INDOBASE_WRANGLER_RESTART_MS || 2000);
let indobaseWranglerAttempt = 0;
for (;;) {
  const label = indobaseWranglerAttempt === 0
    ? `Starting: wrangler dev ${args.join(" ")}`
    : `[indobase] Restarting wrangler (attempt ${indobaseWranglerAttempt})`;
  console.log(`\\n${label}\\n`);
  try {
    execFileSync("pnpm", ["exec", "wrangler", "dev", ...args],
        { stdio: "inherit", cwd: ROOT });
    // Clean exit — stop the loop.
    break;
  } catch (e) {
    const signal = e && e.signal;
    const status = (e && e.status != null) ? e.status : 1;
    // systemd stop / Ctrl-C: prefer exiting the supervisor loop.
    if (signal === "SIGINT" || status === 130) {
      stopDevWatchers();
      process.exit(130);
    }
    if (signal === "SIGTERM" && status === 143) {
      stopDevWatchers();
      process.exit(143);
    }
    // Note: plain status=143 without signal often means workerd died uncleanly —
    // restart (do not treat as intentional systemd stop).
    indobaseWranglerAttempt += 1;
    console.error(
      `[indobase] wrangler exited (status=${status}, signal=${signal || ""}); ` +
      `restarting in ${indobaseWranglerRestartMs}ms (gatekeepers kept warm)`,
    );
    execFileSync(process.execPath, ["-e",
      `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${indobaseWranglerRestartMs})`,
    ], { stdio: "ignore" });
  }
}
'''

# Match from optional IP push + "Starting: wrangler" through process.exit in catch.
TAIL_RE = re.compile(
    r"(?:if \(process\.env\.INDOBASE_WRANGLER_IP\) \{\n"
    r"  args\.push\(\"--ip\", process\.env\.INDOBASE_WRANGLER_IP\);\n"
    r"\}\n)?"
    r"console\.log\(`\\nStarting: wrangler dev \$\{args\.join\(\" \"\)}\\n`\);\n"
    r"\n"
    r"try \{\n"
    r"  execFileSync\(\"pnpm\", \[\"exec\", \"wrangler\", \"dev\", \.\.\.args\],\n"
    r"      \{ stdio: \"inherit\", cwd: ROOT \}\);\n"
    r"\} catch \(e\) \{\n"
    r"  // wrangler was killed or exited with an error; the output was already shown\n"
    r"  // via stdio: \"inherit\", so just propagate the exit code\.\n"
    r"  process\.exit\(e\.status \?\? 1\);\n"
    r"\}\n?",
    re.MULTILINE,
)


def patch(path: Path) -> str:
  text = path.read_text()
  if MARKER in text and "INDOBASE_WRANGLER_IP" in text:
    # Upgrade in-place if an older Indobase loop is present (signal-handling tweak).
    if "plain status=143 without signal" in text:
      return "already-patched"
    # Replace from IP push through end of for-loop body.
    upgrade_re = re.compile(
        r"if \(process\.env\.INDOBASE_WRANGLER_IP\) \{\n"
        r"  args\.push\(\"--ip\", process\.env\.INDOBASE_WRANGLER_IP\);\n"
        r"\}\n"
        r"\n"
        r"// Indobase: wrangler/workerd exits on uncaught DO errors during agent\.run\.\n"
        r".*?"
        r"\}\n\}\n",
        re.DOTALL,
    )
    match = upgrade_re.search(text)
    if not match:
      return "already-patched"
    path.write_text(text[: match.start()] + NEW_BLOCK + text[match.end() :])
    return "upgraded"
  match = TAIL_RE.search(text)
  if not match:
    raise SystemExit(
        f"run-dev-server.js: expected wrangler start/exit block not found in {path}"
    )
  path.write_text(text[: match.start()] + NEW_BLOCK + text[match.end() :])
  return "patched"


def main() -> None:
  path = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH)
  if not path.is_file():
    raise SystemExit(f"missing {path}")
  result = patch(path)
  print(f"run-dev-server.js: {result} ({path})")


if __name__ == "__main__":
  main()
