/** Indobase-branded cold landing — no registrar engine names in customer UI. */

export function renderDomainsWelcomeHtml(opts?: {
  studioUrl?: string
  projectRef?: string
}): string {
  const studio = (opts?.studioUrl || process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(
    /\/+$/,
    ''
  )
  const projectRef = (opts?.projectRef || '').trim()
  const openStudioHref = projectRef
    ? `${studio}/project/${encodeURIComponent(projectRef)}/settings/general#custom-domains`
    : studio
  const signInHref = projectRef
    ? `${studio}/sign-in?returnTo=${encodeURIComponent(`/project/${encodeURIComponent(projectRef)}/settings/general`)}`
    : `${studio}/sign-in`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Domains</title>
  <style>
    :root { --brand: #3B8FD6; --ink: #0f172a; --muted: #64748b; --bg: #f1f5f9; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg); color: var(--ink); padding: 24px;
    }
    .card {
      max-width: 28rem; width: 100%; background: #fff; border: 1px solid #e2e8f0;
      border-radius: 14px; padding: 28px 24px; text-align: center;
    }
    .mark {
      width: 40px; height: 40px; margin: 0 auto 12px; border-radius: 10px;
      background: var(--brand); color: #fff; display: grid; place-items: center;
      font-weight: 700; font-size: 1.1rem;
    }
    h1 { margin: 0 0 8px; font-size: 1.25rem; letter-spacing: -0.02em; }
    h1 span { color: var(--brand); }
    p { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.5; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    a {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;
      text-decoration: none;
    }
    a.primary { background: var(--brand); color: #fff; }
    a.ghost { background: #eff6ff; color: #1e5f9a; }
    .hint { margin-top: 16px; font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark" aria-hidden="true">I</div>
    <h1><span>Indobase</span> Domains</h1>
    <p>Search, register, and manage domains for your Indobase projects. Open Domains from Studio to continue — there is no separate Domains password.</p>
    <div class="actions">
      <a class="primary" href="${openStudioHref}">${projectRef ? 'Open your project in Studio' : 'Open Studio'}</a>
      <a class="ghost" href="${signInHref}">Sign in with Studio</a>
    </div>
    <p class="hint">Studio → Project → Settings → Domains</p>
  </div>
</body>
</html>`
}
