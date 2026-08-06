import type { Session } from './auth.js'
import { buildAgentHint, stripVendorBranding } from './indobase-adapter.js'

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
`

export function renderLandingHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Builder</title>
  <style>${SHELL_CSS}</style>
</head>
<body>
  <header class="ibar">
    <div class="brand">Indobase <span>Builder</span></div>
    <div class="meta">PoC · Indobase Builder Gen 3</div>
  </header>
  <div class="empty">
    <h1>Open Builder from Studio</h1>
    <p>Studio SSO only. Use <strong>Open Builder</strong> in Studio (with <code>BUILDER_USE_CFOS=1</code>) to link your project and enter the agent workspace.</p>
    <p><a class="btn" href="https://studio.indobase.in">Go to Studio</a>
       <a class="btn secondary" href="/sso/health">Health</a></p>
  </div>
</body>
</html>`
}

export function renderWorkspaceHtml(opts: {
  session: Session
  cloudflareOsConfigured: boolean
  osProxyPath?: string
}): string {
  const { session, cloudflareOsConfigured } = opts
  const osPath = opts.osProxyPath || '/os/app/'
  const projectLabel = escapeHtml(session.projectName || session.projectRef)
  const email = escapeHtml(session.email)
  const hasBackend = Boolean(session.backend?.anon_key && session.backend?.api_url)

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

  const envBlock = envJson ? escapeHtml(JSON.stringify(envJson, null, 2)) : 'No backend in handoff.'

  // Gen 3: hint comes from @indobase/cloudflare-adapter (vendor branding stripped).
  const agentHint = escapeHtml(buildAgentHint(session))

  if (!cloudflareOsConfigured) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Builder · ${projectLabel}</title>
  <style>${SHELL_CSS}</style>
</head>
<body>
  <header class="ibar">
    <div class="brand">Indobase <span>Builder</span></div>
    <div class="meta">${email} · ${projectLabel}</div>
    <div class="actions">
      <a class="btn secondary" href="${escapeHtml(session.studioUrl)}/project/${escapeHtml(session.projectRef)}/backend" target="_blank" rel="noopener">Studio</a>
      <button class="btn secondary" type="button" id="logout">Sign out</button>
    </div>
  </header>
  <div class="empty">
    <p class="pill warn">Agent runtime not connected</p>
    <h1 style="margin-top:.75rem">${projectLabel} linked</h1>
    <p>${escapeHtml(
      stripVendorBranding(
        'Studio handoff worked. Start the local agent execution runtime and set CLOUDFLARE_OS_URL on this bridge (see scripts/dev-stack.sh).',
      ),
    )}</p>
    <pre>${envBlock}</pre>
    <p style="margin-top:1rem">
      <a class="btn secondary" href="/sso/health">Health</a>
    </p>
  </div>
  <script>
    document.getElementById('logout')?.addEventListener('click', async () => {
      await fetch('/sso/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    });
  </script>
</body>
</html>`
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Builder · ${projectLabel}</title>
  <style>${SHELL_CSS}</style>
</head>
<body>
  <header class="ibar">
    <div class="brand">Indobase <span>Builder</span></div>
    <div class="meta"><span class="pill ${hasBackend ? 'ok' : 'warn'}">${hasBackend ? 'project linked' : 'no backend'}</span> ${email} · ${projectLabel}</div>
    <div class="actions">
      <button class="btn secondary" type="button" id="toggle-backend">Indobase</button>
      <button class="btn secondary" type="button" id="copy-hint">Copy agent hint</button>
      <a class="btn secondary" href="${escapeHtml(session.studioUrl)}/project/${escapeHtml(session.projectRef)}/backend" target="_blank" rel="noopener">Studio</a>
      <a class="btn secondary" href="${escapeHtml(osPath)}" target="_blank" rel="noopener">Pop out</a>
      <button class="btn secondary" type="button" id="logout">Sign out</button>
    </div>
  </header>
  <div class="stage">
    <iframe id="os-frame" title="Indobase Builder workspace" src="${escapeHtml(osPath)}" allow="clipboard-read; clipboard-write"></iframe>
    <aside class="drawer" id="drawer">
      <h2>Indobase connection</h2>
      <pre id="env-block">${envBlock}</pre>
      <p style="margin:.65rem 0 0; font-size:.78rem; color:var(--muted)">
        Same-origin API proxy: <code>/api/indobase/proxy/rest/v1/…</code>
      </p>
      <div class="actions" style="margin-top:.75rem">
        <button class="btn" type="button" id="copy-env">Copy env JSON</button>
      </div>
    </aside>
  </div>
  <script>
    window.__INDOBASE__ = ${envJson ? JSON.stringify(envJson) : 'null'};
    const hint = ${JSON.stringify(agentHint)};
    const frame = document.getElementById('os-frame');
    function pushContext() {
      try {
        frame?.contentWindow?.postMessage({ type: 'indobase:context', payload: window.__INDOBASE__ }, '*');
      } catch {}
    }
    frame?.addEventListener('load', pushContext);
    setInterval(pushContext, 4000);

    document.getElementById('toggle-backend')?.addEventListener('click', () => {
      document.getElementById('drawer')?.classList.toggle('open');
    });
    document.getElementById('copy-env')?.addEventListener('click', async () => {
      const text = document.getElementById('env-block')?.innerText || '';
      await navigator.clipboard.writeText(text);
    });
    document.getElementById('copy-hint')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(hint);
    });
    document.getElementById('logout')?.addEventListener('click', async () => {
      await fetch('/sso/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    });
  </script>
</body>
</html>`
}
