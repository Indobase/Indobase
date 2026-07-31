/**
 * Indobase-branded cold visit landing — never expose upstream login/register UI.
 */

export function renderCrmWelcomeHtml(opts?: { studioUrl?: string }): string {
  const studio = (opts?.studioUrl || process.env.STUDIO_PUBLIC_URL || 'https://studio.indobase.in').replace(
    /\/+$/,
    ''
  )
  const signIn = `${studio}/sign-in`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase CRM</title>
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
      background: linear-gradient(135deg, #3B8FD6 0%, #2563eb 100%);
      display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 18px;
    }
    h1 { margin: 0 0 8px; font-size: 1.25rem; letter-spacing: -0.02em; }
    h1 span { color: var(--brand); }
    p { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.5; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    a {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 600;
      text-decoration: none;
    }
    a.primary { background: var(--brand); color: #fff; }
    a.ghost { background: #eff6ff; color: #1e5f9a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark" aria-hidden="true">IB</div>
    <h1><span>Indobase</span> CRM</h1>
    <p>Leads, deals, and pipelines for your Indobase project. Open CRM from Studio to continue.</p>
    <div class="actions">
      <a class="primary" href="${signIn}">Sign in with Studio</a>
      <a class="ghost" href="${studio}">Back to Studio</a>
    </div>
  </div>
</body>
</html>`
}
