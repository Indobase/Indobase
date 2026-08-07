/**
 * Indobase OS — core CFOS chrome.
 * Light top bar + agent desktop iframe. No achievement home, no fat business rail.
 */
import type { Session } from './auth.js'
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
    --bar: 52px;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  header.ibar {
    height: var(--bar);
    display: flex; align-items: center; justify-content: space-between; gap: .75rem;
    padding: 0 1rem; border-bottom: 1px solid var(--line);
    background: rgba(11,18,32,.92); backdrop-filter: blur(10px);
  }
  .brand { font-weight: 700; letter-spacing: .02em; font-size: .95rem; white-space: nowrap; }
  .brand span { color: var(--accent); }
  .meta { color: var(--muted); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; gap: .45rem; align-items: center; flex-shrink: 0; }
  a.btn, button.btn {
    appearance: none; border: 0; cursor: pointer; text-decoration: none;
    background: var(--accent); color: #041018; font-weight: 650;
    padding: .35rem .7rem; border-radius: 8px; font-size: .78rem;
  }
  a.btn.secondary, button.btn.secondary {
    background: transparent; color: var(--text); border: 1px solid var(--line);
  }
  .modal-bg {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,.55);
    z-index: 20; align-items: center; justify-content: center; padding: 1rem;
  }
  .modal-bg.open { display: flex; }
  .modal {
    width: min(420px, 100%); background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; padding: 1.1rem 1.15rem; box-shadow: 0 20px 50px rgba(0,0,0,.45);
  }
  .modal h2 { margin: 0 0 .35rem; font-size: 1rem; }
  .modal p { margin: 0 0 .85rem; color: var(--muted); font-size: .82rem; line-height: 1.45; }
  .modal label { display: block; font-size: .72rem; color: var(--muted); margin: .55rem 0 .25rem; }
  .modal input {
    width: 100%; background: #0a101c; border: 1px solid var(--line); color: var(--text);
    border-radius: 8px; padding: .45rem .55rem; font-size: .85rem;
  }
  .modal .row { display: flex; gap: .45rem; margin-top: 1rem; justify-content: flex-end; }
  .modal .status { font-size: .78rem; margin-top: .65rem; min-height: 1.2em; }
  .modal .ok { color: #7ddea2; }
  .modal .err { color: #f0a0a0; }
  .modal code { font-size: .72rem; color: #c5d4ea; }
  .stage { height: calc(100% - var(--bar)); position: relative; }
  .stage iframe { border: 0; width: 100%; height: 100%; background: #000; display: block; }
  .drawer {
    position: absolute; top: 12px; right: 12px; width: min(380px, calc(100% - 24px));
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    padding: .9rem 1rem; box-shadow: 0 12px 40px rgba(0,0,0,.35); display: none; z-index: 5;
  }
  .drawer.open { display: block; }
  .drawer h2 { margin: 0 0 .5rem; font-size: .9rem; color: var(--muted); }
  pre {
    margin: 0; max-height: 220px; overflow: auto; font-size: .72rem;
    background: #0a101c; border: 1px solid var(--line); border-radius: 8px; padding: .65rem;
  }
  .empty {
    max-width: 640px; margin: 4rem auto; padding: 1.5rem;
    border: 1px solid var(--line); border-radius: 14px; background: var(--panel);
  }
  .empty h1 { margin: 0 0 .5rem; font-size: 1.35rem; }
  .empty p { color: var(--muted); line-height: 1.5; }
  .pill {
    display: inline-flex; border: 1px solid var(--line); border-radius: 999px;
    padding: .15rem .55rem; font-size: .72rem; color: var(--muted);
  }
  .ok { color: #7ddea2; }
  .warn { color: #e7c56a; }
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
  .landing .fine { font-size: .72rem; color: var(--muted); margin-top: 1rem; }
`

/** Unauthenticated entry — simple CTA into OTP start (no achievement grid). */
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
  <header class="ibar">
    <div class="brand">Indobase <span>OS</span></div>
  </header>
  <div class="hero">
    <div class="card">
      <h1>Indobase OS</h1>
      <p>Open the agent workspace and build from chat — documents, code, and tools in one shell.</p>
      <div class="cta-row">
        <a class="btn" href="/start">Start building</a>
        <a class="btn secondary" href="/sso/health">Status</a>
      </div>
      <p class="fine">Sign in once, then work inside the agent desktop.</p>
    </div>
  </div>
</body>
</html>`
}

/** Marketing / Get started — name + email OTP → auto workspace. */
export function renderStartHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase — Start building</title>
  <style>${SHELL_CSS}
    .field { display: flex; flex-direction: column; gap: .35rem; margin-bottom: .85rem; }
    .field label { font-size: .75rem; color: var(--muted); }
    .field input {
      appearance: none; border: 1px solid var(--line); border-radius: 8px;
      background: #0a101c; color: var(--text); padding: .55rem .7rem; font-size: .9rem;
    }
    .field input:focus { outline: 2px solid rgba(59,143,214,.25); border-color: var(--accent); }
    .consent { display: flex; gap: .55rem; align-items: flex-start; font-size: .78rem; color: var(--muted); margin-bottom: .85rem; }
    .consent input { margin-top: .2rem; }
    .consent a { color: var(--accent); }
    #start-status { font-size: .78rem; color: var(--muted); min-height: 1.2em; }
    #verify-step { display: none; }
    #verify-step.active { display: block; }
    #identity-step.hidden { display: none; }
  </style>
</head>
<body class="landing">
  <header class="ibar">
    <div class="brand">Indobase <span>OS</span></div>
    <a class="btn secondary" href="/">Back</a>
  </header>
  <div class="hero">
    <div class="card">
      <h1>Start building</h1>
      <p>Enter your details to open the agent workspace.</p>
      <div id="identity-step">
        <form id="start-form">
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" autocomplete="name" required placeholder="Your name" />
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@company.com" />
          </div>
          <label class="consent">
            <input id="dpdp-consent" type="checkbox" required />
            <span>I agree to the <a href="https://indobase.in/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="https://indobase.in/terms" target="_blank" rel="noopener">Terms of Service</a>.</span>
          </label>
          <div class="cta-row">
            <button class="btn" type="submit">Send code</button>
          </div>
          <p id="start-status"></p>
        </form>
      </div>
      <div id="verify-step">
        <p>Enter the verification code we sent to <strong id="verify-email"></strong>.</p>
        <form id="verify-form">
          <div class="field">
            <label for="otp">Verification code</label>
            <input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" required placeholder="6-digit code" maxlength="8" />
          </div>
          <div class="cta-row">
            <button class="btn" type="submit">Open Indobase OS</button>
            <button class="btn secondary" type="button" id="back-to-email">Change email</button>
          </div>
          <p id="verify-status"></p>
        </form>
      </div>
      <p class="fine">New here or returning — continue in the agent workspace after verify.</p>
    </div>
  </div>
  <script>
    const identityStep = document.getElementById('identity-step');
    const verifyStep = document.getElementById('verify-step');
    const startStatus = document.getElementById('start-status');
    const verifyStatus = document.getElementById('verify-status');
    const verifyEmail = document.getElementById('verify-email');
    let pendingName = '';
    let pendingEmail = '';

    function showVerifyStep() {
      identityStep?.classList.add('hidden');
      verifyStep?.classList.add('active');
      if (verifyEmail) verifyEmail.textContent = pendingEmail;
      document.getElementById('otp')?.focus();
    }

    function showIdentityStep() {
      verifyStep?.classList.remove('active');
      identityStep?.classList.remove('hidden');
    }

    if (new URLSearchParams(location.search).get('step') === 'verify' && sessionStorage.getItem('ib_os_start_email')) {
      pendingName = sessionStorage.getItem('ib_os_start_name') || '';
      pendingEmail = sessionStorage.getItem('ib_os_start_email') || '';
      showVerifyStep();
    }

    document.getElementById('back-to-email')?.addEventListener('click', () => {
      showIdentityStep();
      if (verifyStatus) verifyStatus.textContent = '';
    });

    document.getElementById('start-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      pendingName = document.getElementById('name')?.value?.trim() || '';
      pendingEmail = document.getElementById('email')?.value?.trim().toLowerCase() || '';
      const dpdpConsent = document.getElementById('dpdp-consent')?.checked === true;
      if (startStatus) startStatus.textContent = 'Sending code…';
      try {
        const res = await fetch('/auth/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ name: pendingName, email: pendingEmail, dpdpConsent }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (startStatus) startStatus.textContent = body.message || ('Could not start (' + res.status + ')');
          return;
        }
        sessionStorage.setItem('ib_os_start_name', pendingName);
        sessionStorage.setItem('ib_os_start_email', pendingEmail);
        if (startStatus) startStatus.textContent = '';
        showVerifyStep();
        history.replaceState(null, '', '/start?step=verify');
      } catch (err) {
        if (startStatus) startStatus.textContent = err instanceof Error ? err.message : 'Could not start';
      }
    });

    document.getElementById('verify-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('otp')?.value?.trim() || '';
      if (verifyStatus) verifyStatus.textContent = 'Verifying…';
      try {
        const res = await fetch('/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: pendingName, email: pendingEmail, token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (verifyStatus) verifyStatus.textContent = body.message || ('Verification failed (' + res.status + ')');
          return;
        }
        sessionStorage.removeItem('ib_os_start_name');
        sessionStorage.removeItem('ib_os_start_email');
        location.replace(body.next || '/');
      } catch (err) {
        if (verifyStatus) verifyStatus.textContent = err instanceof Error ? err.message : 'Verification failed';
      }
    });
  </script>
</body>
</html>`
}

export function renderWorkspaceHtml(opts: {
  session: Session
  cloudflareOsConfigured: boolean
  /** Same-origin proxy path (optional Pop-out / legacy). */
  osProxyPath?: string
  /**
   * Prefer embedding the agent runtime at its own origin.
   * CF OS serves absolute `/assets/*` and a WebSocket at `/api`; a path-prefix
   * reverse proxy breaks both unless every root route is also forwarded.
   */
  agentRuntimeUrl?: string | null
}): string {
  const { session, cloudflareOsConfigured } = opts
  const osProxyPath = opts.osProxyPath || '/os/app/'
  const runtimeUrl = (opts.agentRuntimeUrl || '').trim().replace(/\/+$/, '')
  // Loopback: embed the runtime origin directly (local `dev-stack.sh`).
  // Non-loopback / unset: same-origin `/os/app/` so CLOUDFLARE_OS_URL can be
  // internal (host.docker.internal / Swarm DNS). Bridge proxies `/assets/*` + `/api` WS.
  const isLoopback =
    Boolean(runtimeUrl) &&
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(runtimeUrl)
  const embedSrc = isLoopback && runtimeUrl ? `${runtimeUrl}/` : osProxyPath
  const projectLabel = escapeHtml(session.projectName || session.projectRef)
  const email = escapeHtml(session.email)
  const suggestedSlug = escapeHtml(
    (session.projectName || session.projectRef)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'my-business',
  )

  const envJson = session.backend
    ? {
        INDOBASE_URL: session.backend.api_url,
        INDOBASE_ANON_KEY: session.backend.anon_key,
        VITE_INDOBASE_URL: session.backend.api_url,
        VITE_INDOBASE_ANON_KEY: session.backend.anon_key,
        INDOBASE_PROXY: '/api/indobase/proxy',
        PROJECT_REF: session.projectRef,
      }
    : null

  const envBlock = envJson
    ? escapeHtml(JSON.stringify(envJson, null, 2))
    : 'No backend yet — say “Add login” or “Add database” to provision lazily.'

  const shellHead = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase OS · ${projectLabel}</title>
  <style>${SHELL_CSS}</style>
</head>
<body>
  <header class="ibar">
    <div class="brand">Indobase <span>OS</span></div>
    <div class="meta">${email} · ${projectLabel}</div>
    <div class="actions">
      <button class="btn" type="button" id="go-live">Go Live</button>
      <button class="btn secondary" type="button" id="logout">Sign out</button>
    </div>
  </header>
  <div class="modal-bg" id="launch-modal" role="dialog" aria-modal="true" aria-labelledby="launch-title">
    <div class="modal">
      <h2 id="launch-title">Launch Business</h2>
      <p>Go live on Indobase — your subdomain or a domain you already own. No other hosts.</p>
      <label for="launch-sub">Indobase link</label>
      <div style="display:flex;align-items:center;gap:.35rem">
        <input id="launch-sub" value="${suggestedSlug}" autocomplete="off" />
        <span style="color:var(--muted);font-size:.8rem;white-space:nowrap">.indobase.in</span>
      </div>
      <label for="launch-domain">Your domain (optional)</label>
      <input id="launch-domain" placeholder="www.yourbusiness.com" autocomplete="off" />
      <div class="status" id="launch-status"></div>
      <div class="row">
        <button class="btn secondary" type="button" id="launch-cancel">Cancel</button>
        <button class="btn" type="button" id="launch-confirm">Launch</button>
      </div>
    </div>
  </div>`

  const shellScript = `
  <script>
    window.__INDOBASE__ = ${envJson ? JSON.stringify(envJson) : 'null'};
    const frame = document.getElementById('os-frame');
    async function pushContext() {
      try {
        let hint = '';
        try {
          const s = await fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json());
          hint = s.agent_hint || '';
          window.__INDOBASE_AGENT_HINT__ = hint;
          window.__INDOBASE_LAUNCH__ = {
            api: '/api/os/launch',
            status: '/api/os/launch/status',
            tool: '/api/os/tools/launchBusiness',
            toolAlias: '/api/os/tools/goLive',
          };
        } catch {}
        frame?.contentWindow?.postMessage({
          type: 'indobase:context',
          payload: Object.assign({}, window.__INDOBASE__ || {}, {
            AGENT_HINT: hint,
            LAUNCH_API: '/api/os/launch',
            LAUNCH_TOOL: '/api/os/tools/launchBusiness',
            LAUNCH_RULES: 'HARD PATH: launchBusiness with real html/files. Claim live only after ok+url. Indobase subdomain (*.indobase.in) or domain you own (CNAME → sites.indobase.in). Never third-party hosts. Enable ≠ Connect.',
          }),
        }, '*');
      } catch {}
    }
    frame?.addEventListener('load', pushContext);
    setInterval(pushContext, 4000);
    pushContext();

    const modal = document.getElementById('launch-modal');
    const statusEl = document.getElementById('launch-status');
    document.getElementById('go-live')?.addEventListener('click', () => {
      modal?.classList.add('open');
      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'status'; }
    });
    document.getElementById('launch-cancel')?.addEventListener('click', () => modal?.classList.remove('open'));
    document.getElementById('launch-confirm')?.addEventListener('click', async () => {
      const subdomain = document.getElementById('launch-sub')?.value?.trim() || '';
      const customDomain = document.getElementById('launch-domain')?.value?.trim() || '';
      if (statusEl) { statusEl.textContent = 'Launching…'; statusEl.className = 'status'; }
      try {
        const res = await fetch('/api/os/launch', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            title: ${JSON.stringify(session.projectName || session.projectRef)},
            subdomain,
            customDomain: customDomain || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          if (statusEl) { statusEl.textContent = body.message || 'Could not go live'; statusEl.className = 'status err'; }
          return;
        }
        let msg = body.message || ('Live: ' + (body.url || ''));
        if (body.dns && body.dns[0]) {
          msg += ' DNS: CNAME ' + body.dns[0].name + ' → ' + body.dns[0].value;
        }
        if (statusEl) { statusEl.innerHTML = '<span class="ok">' + msg.replace(/</g,'&lt;') + '</span> <div><a class="btn" style="display:inline-block;margin-top:.5rem" href="' + (body.preview_url || body.url) + '" target="_blank" rel="noopener">Open live site</a></div>'; statusEl.className = 'status'; }
      } catch (err) {
        if (statusEl) { statusEl.textContent = err instanceof Error ? err.message : 'Could not go live'; statusEl.className = 'status err'; }
      }
    });

    document.getElementById('logout')?.addEventListener('click', async () => {
      await fetch('/sso/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    });
  </script>
</body>
</html>`

  if (!cloudflareOsConfigured) {
    return `${shellHead}
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
  ${shellScript}`
  }

  return `${shellHead}
  <div class="stage">
    <iframe id="os-frame" title="Indobase OS" src="${escapeHtml(embedSrc)}" allow="clipboard-read; clipboard-write"></iframe>
  </div>
  ${shellScript}`
}
