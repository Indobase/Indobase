/**
 * Indobase OS — emergency / offline HTML only.
 * Normal entry proxies the CFOS agent desktop as the top document (no iframe shell).
 */
import type { Session } from './auth.js'
import { injectAuthChrome } from './auth-chrome.js'
import { stripVendorBranding } from './indobase-adapter.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SHELL_CSS = `
  :root {
    --bg: #0b1220;
    --panel: #121a2b;
    --line: rgba(255,255,255,.08);
    --text: #e8eef8;
    --muted: #9aa8c0;
    --accent: #3B8FD6;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  .pill {
    display: inline-flex; border: 1px solid var(--line); border-radius: 999px;
    padding: .15rem .55rem; font-size: .72rem; color: var(--muted);
  }
  .ok { color: #7ddea2; }
  .warn { color: #e7c56a; }
  .empty {
    max-width: 640px; margin: 4rem auto; padding: 1.5rem;
    border: 1px solid var(--line); border-radius: 14px; background: var(--panel);
  }
  .empty h1 { margin: 0 0 .5rem; font-size: 1.35rem; }
  .empty p { color: var(--muted); line-height: 1.5; }
  a.btn, button.btn {
    appearance: none; border: 0; cursor: pointer; text-decoration: none;
    background: var(--accent); color: #041018; font-weight: 650;
    padding: .35rem .7rem; border-radius: 8px; font-size: .78rem;
    display: inline-block;
  }
  a.btn.secondary, button.btn.secondary {
    background: transparent; color: var(--text); border: 1px solid var(--line);
  }
  pre {
    margin: 0; max-height: 220px; overflow: auto; font-size: .72rem;
    background: #0a101c; border: 1px solid var(--line); border-radius: 8px; padding: .65rem;
  }
  .landing {
    min-height: 100%; display: flex; flex-direction: column;
  }
  .landing .hero {
    flex: 1; display: grid; place-items: center; padding: 2rem 1.25rem;
    background:
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,143,214,.18), transparent 55%),
      var(--bg);
  }
  .landing .card {
    width: min(520px, 100%);
    border: 1px solid var(--line); border-radius: 16px; background: var(--panel);
    padding: 1.75rem 1.5rem;
  }
  .landing h1 { margin: 0 0 .5rem; font-size: 1.55rem; letter-spacing: -.02em; }
  .landing p { color: var(--muted); line-height: 1.55; margin: 0 0 1rem; }
  .landing .cta-row { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1.1rem; }
`

/**
 * Same-document bootstrap for the proxied CFOS desktop.
 * Replaces the old parent-frame postMessage + Go Live chrome.
 * Agent uses /api/session + launchBusiness; guests get Create-account chrome
 * (same /auth/start|/auth/verify as chat) so auth works if the model stalls.
 */
export function injectIndobaseContextBootstrap(html: string): string {
  const script = `<script>
(function () {
  async function pull() {
    try {
      const s = await fetch('/api/session', { credentials: 'same-origin' }).then(function (r) {
        return r.json();
      });
      window.__INDOBASE_AGENT_HINT__ = s.agent_hint || '';
      window.__INDOBASE_ONBOARDING__ = s.onboarding || null;
      window.__INDOBASE_JOURNEY__ = s.journey || null;
      window.__INDOBASE_PRODUCTION_JOB__ = s.production_job || null;
      window.__INDOBASE_HOME__ = s.home || null;
      window.__INDOBASE_USAGE__ = s.usage || null;
      window.__INDOBASE_ACTIONS__ = s.actions || s.command_palette || [];
      window.__INDOBASE_GUEST__ = !!s.guest;
      window.__INDOBASE_SESSION_STAGE__ = s.stage || (s.guest ? 'guest' : 'member');
      try {
        if (s.guest) document.documentElement.removeAttribute('data-ib-signed-in');
        else document.documentElement.setAttribute('data-ib-signed-in', '1');
      } catch (_) {}
      window.__INDOBASE_AUTH__ = s.auth || {
        start: '/auth/start',
        verify: '/auth/verify',
        in_chat: true,
        ui: true,
      };
      window.__INDOBASE_LAUNCH__ = s.launch || {
        api: '/api/os/launch',
        status: '/api/os/launch/status',
        production: '/api/os/apps/launch',
        tool: '/api/os/tools/launchBusiness',
        tool_alias: '/api/os/tools/goLive',
      };
      window.__INDOBASE_PREVIEW_STATUS__ = (s.preview && s.preview.status) || null;
      window.__INDOBASE_PREVIEW_URL__ =
        (s.preview && s.preview.status === 'ready' && s.preview.url) ||
        (s.project && s.project.state === 'live' && s.journey && s.journey.live_url) ||
        (s.journey && s.journey.live_url) ||
        (s.production_job && s.production_job.status === 'live' && s.production_job.url) ||
        null;
      window.__INDOBASE_PROJECT__ = s.project || null;
      // ChatInterface meters each user send via this path (hard Free-plan enforce).
      window.__INDOBASE_BEGIN_TURN__ = '/api/os/agent/begin-turn';
      window.__INDOBASE__ = Object.assign(
        {
          guest: !!s.guest,
          PROJECT_REF: s.project_ref || (s.backend && s.backend.project_ref) || null,
        },
        s.backend
          ? {
              INDOBASE_URL: s.backend.api_url,
              INDOBASE_ANON_KEY: s.backend.anon_key,
              VITE_INDOBASE_URL: s.backend.api_url,
              VITE_INDOBASE_ANON_KEY: s.backend.anon_key,
              INDOBASE_PROXY: '/api/indobase/proxy',
              INDOBASE_AUTH_URL: s.backend.auth_url,
              INDOBASE_REST_URL: s.backend.rest_url,
            }
          : {},
        (s.backend && s.backend.public_env) || {},
      );
      try {
        window.dispatchEvent(
          new CustomEvent('indobase:context', {
            detail: Object.assign({}, window.__INDOBASE__ || {}, {
              AGENT_HINT: window.__INDOBASE_AGENT_HINT__,
              ONBOARDING: window.__INDOBASE_ONBOARDING__,
              JOURNEY: window.__INDOBASE_JOURNEY__,
              PRODUCTION_JOB: window.__INDOBASE_PRODUCTION_JOB__,
              HOME: window.__INDOBASE_HOME__,
              USAGE: window.__INDOBASE_USAGE__,
              ACTIONS: window.__INDOBASE_ACTIONS__,
              LAUNCH_API: '/api/os/launch',
              LAUNCH_TOOL: '/api/os/tools/launchBusiness',
              PRODUCTION_LAUNCH: '/api/os/apps/launch',
              LAUNCH_RULES:
                'HARD PATH: production Go Live is POST /api/os/apps/launch. Claim live only when job status=live. Draft preview may use launchBusiness with production:false. Indobase subdomain or a domain you own. Never third-party hosts.',
              PREVIEW_POLICY: (s.launch && s.launch.preview_policy) || '',
              LIVE_URL: (s.journey && s.journey.live_url) || null,
              PREVIEW_URL: window.__INDOBASE_PREVIEW_URL__,
              PROJECT: window.__INDOBASE_PROJECT__,
              PROMPT_QUOTA: '/api/os/usage/prompt-quota',
              BEGIN_TURN: window.__INDOBASE_BEGIN_TURN__,
              AUTH: window.__INDOBASE_AUTH__,
              GUEST: !!s.guest,
              STAGE: window.__INDOBASE_SESSION_STAGE__,
              DISPLAY_NAME: s.display_name || null,
            }),
          }),
        );
      } catch (_) {}
      // Claim session if CFOS authVerify AgentTool finished OTP (workerd cannot Set-Cookie).
      if (s.guest) {
        try {
          const claim = await fetch('/api/os/auth/claim-session', { credentials: 'same-origin' }).then(function (r) {
            return r.json();
          });
          if (claim && claim.upgraded) {
            window.location.reload();
            return;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  pull();
  setInterval(pull, 15000);

  // Hide CFOS tool-call pills that leak internal names (authStart, ensureDatabase, …).
  (function hideOperatorToolPills() {
    var HIDE = /\\b(authStart|authVerify|sessionStatus|ensureDatabase|ensureLogin|ensureEmail|ensureAnalytics|launchBusiness|launchProductionApp|resolveProductImages|guidedBackend|applySchema|setupShopCatalog|placeTestShopOrder|listShopOrders|connectGateway|wireCheckout|createGadget|PocketBase)\\b/;
    function scrub(root) {
      try {
        var nodes = (root || document).querySelectorAll('button, [aria-expanded]');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!t || t.length > 140 || !HIDE.test(t)) continue;
          if (/Launch store|Open store|Connect payments|Create account|Go Live/i.test(t) && t.length < 40) continue;
          var row = el.closest('[class*="rounded-xl"]') || el;
          row.setAttribute('data-ib-hidden-tool', '1');
          row.style.display = 'none';
        }
      } catch (_) {}
    }
    try {
      var css = document.createElement('style');
      css.id = 'ib-hide-internal-tools';
      css.textContent = '[data-ib-hidden-tool="1"]{display:none!important}';
      document.head.appendChild(css);
    } catch (_) {}
    if (document.body) scrub(document.body);
    try {
      new MutationObserver(function () { scrub(document.body); }).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (_) {}
  })();

  // Create account action → open auth modal (FAB removed).
  window.addEventListener('indobase:run-action', function (ev) {
    try {
      var id = ev && ev.detail && ev.detail.id;
      if (id === 'create-account' && typeof window.__INDOBASE_OPEN_AUTH__ === 'function') {
        window.__INDOBASE_OPEN_AUTH__();
      }
    } catch (_) {}
  });
})();
</script>`
  let withScript = html
  if (/<\/body>/i.test(html)) {
    withScript = html.replace(/<\/body>/i, `${script}</body>`)
  } else {
    withScript = `${html}${script}`
  }
  return injectAuthChrome(withScript)
}

/** Fallback if handoff secret missing — normal entry mints a guest and opens the agent desktop. */
export function renderLandingHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase OS</title>
  <style>${SHELL_CSS}</style>
</head>
<body class="landing">
  <div class="hero">
    <div class="card">
      <h1>Indobase OS</h1>
      <p>Workspace unavailable right now. Retry shortly, or open from your Indobase account link.</p>
      <div class="cta-row">
        <a class="btn" href="/">Retry</a>
        <a class="btn secondary" href="/sso/health">Status</a>
      </div>
    </div>
  </div>
</body>
</html>`
}

/**
 * Deep-linked /workspace/:id while unsigned-in or guest — do not open as the wrong CFOS principal.
 */
export function renderWorkspaceSignInRequiredHtml(): string {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in — Indobase Builder</title>
  <style>${SHELL_CSS}</style>
</head>
<body class="landing">
  <div class="hero">
    <div class="card">
      <h1>Sign in to open this workspace</h1>
      <p>This workspace belongs to your Indobase account. Guests cannot open it — sign in with email so we load your Builder session, then retry this link.</p>
      <div class="cta-row">
        <a class="btn" href="/?open_auth=1">Sign in with email</a>
        <a class="btn secondary" href="/">Start a new workspace</a>
      </div>
    </div>
  </div>
  <script>
    try {
      window.dispatchEvent(new CustomEvent('indobase:open-auth'));
    } catch (_) {}
  </script>
</body>
</html>`
  return injectAuthChrome(html)
}

/**
 * @deprecated Account creation happens in chat. `/start` redirects to `/`.
 * Kept as a tiny bounce page for old marketing links.
 */
export function renderStartHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase OS</title>
  <meta http-equiv="refresh" content="0;url=/" />
  <style>${SHELL_CSS}</style>
</head>
<body class="landing">
  <div class="hero"><div class="card">
    <h1>Opening Indobase OS…</h1>
    <p>Create your account in chat when you’re ready.</p>
    <div class="cta-row"><a class="btn" href="/">Continue</a></div>
  </div></div>
</body>
</html>`
}

/** Shown only when CLOUDFLARE_OS_URL is unset — no iframe chrome. */
export function renderOfflineDesktopHtml(session: Session): string {
  const projectLabel = escapeHtml(session.projectName || session.projectRef)
  const envJson = session.backend
    ? {
        INDOBASE_URL: session.backend.api_url,
        INDOBASE_ANON_KEY: session.backend.anon_key,
        PROJECT_REF: session.projectRef,
        INDOBASE_AUTH_URL: session.backend.auth_url,
        INDOBASE_REST_URL: session.backend.rest_url,
        ...(session.backend.public_env || {}),
      }
    : null
  const envBlock = envJson
    ? escapeHtml(JSON.stringify(envJson, null, 2))
    : 'No backend yet — say “Add login” or “Add database” to provision lazily.'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase OS · ${projectLabel}</title>
  <style>${SHELL_CSS}</style>
</head>
<body>
  <div class="empty">
    <p class="pill warn">Agent desktop offline</p>
    <h1 style="margin-top:.75rem">${projectLabel}</h1>
    <p>${escapeHtml(
      stripVendorBranding(
        'Your session is linked. Start the agent execution runtime and set CLOUDFLARE_OS_URL (see scripts/dev-stack.sh).',
      ),
    )}</p>
    <pre>${envBlock}</pre>
    <p style="margin-top:1rem">
      <a class="btn secondary" href="/sso/health">Status</a>
    </p>
  </div>
</body>
</html>`
}

/**
 * @deprecated Prefer proxying CFOS at `/`. Kept for tests that still import the name;
 * aliases the offline page (no iframe / no outer bar).
 */
export function renderWorkspaceHtml(opts: {
  session: Session
  cloudflareOsConfigured: boolean
  osProxyPath?: string
  agentRuntimeUrl?: string | null
}): string {
  void opts.osProxyPath
  void opts.agentRuntimeUrl
  if (opts.cloudflareOsConfigured) {
    // Callers should proxy CFOS; this path only exists for unit tests / miswired callers.
    return renderOfflineDesktopHtml(opts.session).replace(
      'Agent desktop offline',
      'Use direct CFOS proxy at /',
    )
  }
  return renderOfflineDesktopHtml(opts.session)
}
