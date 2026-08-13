/**
 * Deterministic production shells when the job must generate UI without waiting on the agent.
 * Agent may replace these later; the job still owns wire/verify/deploy.
 */

import { injectIndobaseEnvIntoHtml, buildIndobasePublicEnv } from '../publish-env-inject.js'
import type { BackendConfig } from '../auth.js'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;',
  )
}

export function buildProductionLandingHtml(opts: { brand?: string | null; intent?: string | null }): string {
  const brand = escapeHtml((opts.brand || 'Your business').trim() || 'Your business')
  const blurb = escapeHtml(
    (opts.intent || 'A production-ready site on Indobase.').trim().slice(0, 220) ||
      'A production-ready site on Indobase.',
  )
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title>
<meta name="description" content="${blurb}"/>
<style>
  :root { color-scheme: light; --ink:#111; --muted:#5b5b5b; --accent:#3B8FD6; --bg:#f7f7f5; }
  body { margin:0; font:16px/1.5 system-ui,sans-serif; color:var(--ink); background:var(--bg); }
  header, main, footer { max-width:720px; margin:0 auto; padding:32px 20px; }
  a { color:var(--accent); }
  .cta { display:inline-block; background:var(--accent); color:#fff; padding:12px 18px; border-radius:8px; text-decoration:none; }
</style>
</head>
<body>
<header data-ib-section="hero" data-ib-component="Hero" data-ib-label="Hero">
  <p>Indobase</p>
  <h1>${brand}</h1>
  <p>${blurb}</p>
  <a class="cta" href="#contact">Get in touch</a>
</header>
<main id="contact" data-ib-section="content" data-ib-component="Content" data-ib-label="Content">
  <h2>Ready when you are</h2>
  <p>This site is live on Indobase. Add a domain or grow into a full app when you need accounts and saved data.</p>
</main>
<footer>
  <a href="/privacy">Privacy Policy</a>
  ·
  <a href="/terms">Terms of Service</a>
</footer>
</body>
</html>`
}

export function buildProductionSaasHtml(opts: {
  brand?: string | null
  backend: BackendConfig
}): string {
  const brand = escapeHtml((opts.brand || 'Workspace').trim() || 'Workspace')
  const env = buildIndobasePublicEnv(opts.backend)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title>
<meta name="description" content="${brand} — sign in and save your work on Indobase."/>
<style>
  :root { color-scheme: light; --ink:#111; --muted:#5b5b5b; --line:#e8e8e8; --accent:#3B8FD6; --bg:#f7f7f5; --card:#fff; }
  body { margin:0; font:15px/1.5 system-ui,sans-serif; color:var(--ink); background:var(--bg); }
  main { max-width:720px; margin:40px auto; padding:0 20px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; }
  input, button { font:inherit; padding:10px 12px; border-radius:8px; border:1px solid var(--line); width:100%; }
  button { background:var(--accent); color:#fff; border:0; cursor:pointer; margin-top:8px; }
  button.secondary { background:#fff; color:var(--ink); border:1px solid var(--line); }
  .muted { color:var(--muted); }
  .row { display:flex; gap:8px; }
  .row input { flex:1; }
  ul { padding-left:18px; }
</style>
</head>
<body>
<main>
  <h1>${brand}</h1>
  <p class="muted">Customers can sign in. Their data is saved.</p>
  <div id="auth" class="card">
    <p id="status">Enter your email to receive a sign-in code.</p>
    <input id="email" type="email" placeholder="you@company.com" autocomplete="email"/>
    <button id="send" type="button">Send code</button>
    <div id="otp-row" hidden>
      <input id="otp" inputmode="numeric" placeholder="6-digit code" autocomplete="one-time-code"/>
      <button id="verify" type="button">Sign in</button>
    </div>
  </div>
  <div id="app" class="card" hidden>
    <p id="who"></p>
    <div class="row">
      <input id="name" placeholder="New organization name"/>
      <button id="create" type="button">Create</button>
    </div>
    <ul id="list"></ul>
    <button id="out" class="secondary" type="button">Sign out</button>
  </div>
</main>
<script>
(function () {
  var env = window.__INDOBASE_ENV__ || {};
  var api = (env.INDOBASE_URL || env.INDOBASE_RECORDS_BASE || '').replace(/\\/+$/, '');
  var prefix = env.INDOBASE_COLLECTION_PREFIX || '';
  var tokenKey = 'indobase_saas_token';
  function col(name) { return (window.__INDOBASE_COLLECTION__ ? window.__INDOBASE_COLLECTION__(name) : prefix + name); }
  function authHeaders(token) {
    var h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }
  function $(id) { return document.getElementById(id); }
  function show(signedIn, email) {
    $('auth').hidden = signedIn;
    $('app').hidden = !signedIn;
    if (signedIn) $('who').textContent = 'Signed in as ' + email;
  }
  async function requestOtp() {
    var email = $('email').value.trim();
    $('status').textContent = 'Sending code…';
    var res = await fetch(api + '/api/collections/users/request-otp', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: email })
    });
    if (!res.ok) { $('status').textContent = 'Could not send code.'; return; }
    $('otp-row').hidden = false;
    $('status').textContent = 'Enter the code we emailed you.';
  }
  async function verifyOtp() {
    var email = $('email').value.trim();
    var otp = $('otp').value.trim();
    var res = await fetch(api + '/api/collections/users/auth-with-otp', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: email, otp: otp })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.token) { $('status').textContent = 'Sign-in failed.'; return; }
    sessionStorage.setItem(tokenKey, JSON.stringify({ token: data.token, email: email }));
    show(true, email);
    await loadOrgs(data.token);
  }
  async function loadOrgs(token) {
    var res = await fetch(api + '/api/collections/' + col('organizations') + '/records?sort=-created', { headers: authHeaders(token) });
    var data = await res.json().catch(function () { return { items: [] }; });
    var items = data.items || data.records || [];
    $('list').innerHTML = items.map(function (o) { return '<li>' + (o.name || o.id) + '</li>'; }).join('') || '<li class="muted">No organizations yet</li>';
  }
  async function createOrg() {
    var saved = JSON.parse(sessionStorage.getItem(tokenKey) || 'null');
    if (!saved || !saved.token) return;
    var name = $('name').value.trim();
    if (!name) return;
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org';
    var res = await fetch(api + '/api/collections/' + col('organizations') + '/records', {
      method: 'POST', headers: authHeaders(saved.token),
      body: JSON.stringify({ name: name, slug: slug + '-' + Date.now().toString(36) })
    });
    if (res.ok) { $('name').value = ''; await loadOrgs(saved.token); }
  }
  function signOut() {
    sessionStorage.removeItem(tokenKey);
    show(false);
    $('status').textContent = 'Signed out.';
  }
  $('send').onclick = requestOtp;
  $('verify').onclick = verifyOtp;
  $('create').onclick = createOrg;
  $('out').onclick = signOut;
  var saved = JSON.parse(sessionStorage.getItem(tokenKey) || 'null');
  if (saved && saved.token) {
    show(true, saved.email || '');
    loadOrgs(saved.token);
  }
})();
</script>
<footer style="max-width:720px;margin:0 auto;padding:16px 20px;font-size:13px">
  <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
</footer>
</body>
</html>`
  return injectIndobaseEnvIntoHtml(html, env)
}
