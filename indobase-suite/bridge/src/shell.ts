/**
 * Indobase Workspace HTML shell — file manager + editor host.
 * Brand assets from /brand/*; never name upstream engines in chrome.
 */

import type { Session } from './auth.js'
import type { EditorConfigBundle } from './onlyoffice.js'
import { listModulesForApi, type SuiteModuleId } from './modules.js'
import type { WorkspaceMap } from './workspace-map.js'
import { workspaceHomePath } from './workspace-map.js'
import { modulePath } from './modules.js'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STYLES = `
:root {
  --brand: #3B8FD6;
  --brand-ink: #1e5f9a;
  --ink: #0f172a;
  --muted: #64748b;
  --surface: #ffffff;
  --bg: #f1f5f9;
  --border: #e2e8f0;
  --ok: #059669;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--ink); min-height: 100vh; }
a { color: var(--brand); }
header.appbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  position: sticky;
  top: 0;
  z-index: 10;
}
header.appbar img.mark { width: 28px; height: 28px; }
header.appbar .title { font-weight: 650; font-size: 15px; letter-spacing: -0.01em; }
header.appbar .title span { color: var(--brand); }
header.appbar .pill {
  display: inline-block; background: #eff6ff; color: #1d4ed8;
  padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
}
header.appbar .spacer { flex: 1; }
header.appbar .meta { font-size: 13px; color: var(--muted); }
header.appbar a.studio {
  font-size: 13px; text-decoration: none; color: var(--brand-ink); font-weight: 500;
}
.layout { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 52px); }
nav.rail {
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
nav.rail a {
  display: block; padding: 10px 12px; border-radius: 8px;
  text-decoration: none; color: var(--ink); font-size: 14px; font-weight: 500;
}
nav.rail a:hover { background: #f8fafc; }
nav.rail a.active { background: #eff6ff; color: var(--brand-ink); }
main.panel { padding: 24px 28px; max-width: 1100px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 18px; }
.toolbar h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; flex: 1; min-width: 160px; }
button, .btn {
  appearance: none; border: 1px solid var(--border); background: var(--surface);
  color: var(--ink); padding: 8px 14px; border-radius: 8px; font-size: 13px;
  font-weight: 550; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
button.primary, .btn.primary {
  background: var(--brand); border-color: var(--brand); color: #fff;
}
button:disabled { opacity: 0.55; cursor: not-allowed; }
.table {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
}
.table table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th, .table td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.table th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: #f8fafc; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: #fafbfc; }
.empty { padding: 40px 20px; text-align: center; color: var(--muted); font-size: 14px; }
.placeholder-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 32px; max-width: 520px;
}
.placeholder-card h2 { margin: 0 0 8px; font-size: 18px; }
.placeholder-card p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
.meetings-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; max-width: 640px;
}
.meetings-card h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.02em; }
.meetings-card .lede { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.meetings-card .room {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; background: #f8fafc; border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 12px; margin: 0 0 16px; word-break: break-all;
}
.meetings-card .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
#meet-embed {
  margin-top: 16px; background: #0f172a; border-radius: 12px; overflow: hidden;
  min-height: 0; height: 0; transition: min-height 0.2s ease;
}
#meet-embed.active { min-height: min(70vh, 720px); height: min(70vh, 720px); }
#meet-embed iframe { border: 0; width: 100%; height: 100%; }
.calendar-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 28px; max-width: 100%;
}
.calendar-card h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.02em; }
.calendar-card .lede { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.5; max-width: 640px; }
.calendar-card .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
#calendar-embed {
  margin-top: 8px; background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
  min-height: min(72vh, 780px); height: min(72vh, 780px);
}
#calendar-embed iframe { border: 0; width: 100%; height: 100%; }
.err { color: #b91c1c; font-size: 13px; margin-top: 8px; }
@media (max-width: 800px) {
  .layout { grid-template-columns: 1fr; }
  nav.rail { flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid var(--border); }
}
`

export function renderWorkspaceShell(opts: {
  session: Session
  map: WorkspaceMap
  activeModule?: SuiteModuleId
  studioUrl: string
}): string {
  const home = workspaceHomePath(opts.map)
  const modules = listModulesForApi()
  const active = opts.activeModule || 'files'
  const rail = modules
    .map((m) => {
      const href =
        m.externalProduct === 'email'
          ? `${opts.studioUrl}/project/${encodeURIComponent(opts.session.projectRef)}/workspace?open=mail`
          : modulePath(opts.map, m.id)
      const cls = active === m.id ? 'active' : ''
      return `<a class="${cls}" href="${esc(href)}">${esc(m.label)}</a>`
    })
    .join('')

  const isCalendar = active === 'calendar'
  const isMeetings = active === 'meetings'
  const createKind =
    active === 'docs' ? 'doc' : active === 'sheets' ? 'sheet' : active === 'presentations' ? 'slide' : ''

  let body: string
  if (isCalendar) {
    body = `<div class="calendar-card">
        <h1>Calendar</h1>
        <p class="lede">Open Indobase Calendar for this project — events, availability, and booking links. Signed in via Studio.</p>
        <div class="actions">
          <a class="btn primary" id="btn-open-calendar" href="#" rel="noopener">Open Calendar</a>
          <button type="button" id="btn-copy-calendar" disabled>Copy booking link</button>
        </div>
        <p class="err" id="err" hidden></p>
      </div>`
  } else if (isMeetings) {
    body = `<div class="meetings-card">
        <h1>Meetings</h1>
        <p class="lede">Start a project video call in Indobase Meet. Everyone with access to this project joins the same room — signed in via Studio.</p>
        <div class="room" id="meet-room">Loading…</div>
        <div class="actions">
          <a class="btn primary" id="btn-open-meet" href="#" rel="noopener">Open Meet</a>
          <button type="button" id="btn-copy-invite" disabled>Copy invite link</button>
        </div>
        <p class="err" id="err" hidden></p>
      </div>`
  } else {
    body = `<div class="toolbar">
        <h1>${esc(modules.find((m) => m.id === active)?.label || 'Files')}</h1>
        ${
          createKind
            ? `<button class="primary" type="button" id="btn-create" data-kind="${createKind}">New ${esc(
                active === 'docs' ? 'Doc' : active === 'sheets' ? 'Sheet' : 'Presentation'
              )}</button>`
            : `<button class="primary" type="button" id="btn-create" data-kind="doc">New Doc</button>
               <button type="button" id="btn-create-sheet" data-kind="sheet">New Sheet</button>
               <button type="button" id="btn-create-slide" data-kind="slide">New Presentation</button>`
        }
      </div>
      <div class="table"><div id="file-list" class="empty">Loading…</div></div>
      <p class="err" id="err" hidden></p>`
  }

  const meetingsScript = isMeetings
    ? `
  <script>
  (function () {
    var errEl = document.getElementById('err');
    var roomEl = document.getElementById('meet-room');
    var openBtn = document.getElementById('btn-open-meet');
    var copyBtn = document.getElementById('btn-copy-invite');
    var cfg = null;
    function showErr(msg) {
      if (!errEl) return;
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
    }
    async function bootstrap() {
      var r = await fetch('/api/meetings/config', { credentials: 'same-origin' });
      if (!r.ok) {
        showErr('Could not load meeting settings');
        if (roomEl) roomEl.textContent = 'Unavailable';
        return;
      }
      cfg = await r.json();
      if (roomEl) roomEl.textContent = 'Meeting · ' + (cfg.meetingId || cfg.roomName || '');
      if (!cfg.ready || !cfg.launchUrl) {
        showErr('Meet is not configured on this deployment yet. Ask your operator to set MEET_PUBLIC_URL and MEET_HANDOFF_SECRET.');
        if (openBtn) openBtn.setAttribute('aria-disabled', 'true');
        return;
      }
      if (openBtn) {
        openBtn.href = cfg.launchUrl;
        openBtn.removeAttribute('aria-disabled');
      }
      if (copyBtn) copyBtn.disabled = !cfg.inviteUrl;
    }
    if (copyBtn) copyBtn.addEventListener('click', async function () {
      if (!cfg || !cfg.inviteUrl) return;
      try {
        await navigator.clipboard.writeText(cfg.inviteUrl);
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = 'Copy invite link'; }, 1600);
      } catch (_) {
        showErr('Could not copy invite link');
      }
    });
    bootstrap();
  })();
  </script>`
    : ''

  const calendarScript = isCalendar
    ? `
  <script>
  (function () {
    var errEl = document.getElementById('err');
    var openBtn = document.getElementById('btn-open-calendar');
    var copyBtn = document.getElementById('btn-copy-calendar');
    var cfg = null;
    function showErr(msg) {
      if (!errEl) return;
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
    }
    async function bootstrap() {
      var r = await fetch('/api/calendar/config', { credentials: 'same-origin' });
      if (!r.ok) {
        showErr('Could not load calendar settings');
        return;
      }
      cfg = await r.json();
      if (!cfg.ready || !cfg.launchUrl) {
        showErr('Calendar is not configured on this deployment yet. Ask your operator to set CALENDAR_PUBLIC_URL and CALENDAR_HANDOFF_SECRET.');
        if (openBtn) openBtn.setAttribute('aria-disabled', 'true');
        return;
      }
      if (openBtn) {
        openBtn.href = cfg.launchUrl;
        openBtn.removeAttribute('aria-disabled');
      }
      if (copyBtn) copyBtn.disabled = !(cfg.bookingUrl || cfg.openUrl);
    }
    if (copyBtn) copyBtn.addEventListener('click', async function () {
      var link = (cfg && (cfg.bookingUrl || cfg.openUrl)) || '';
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = 'Copy booking link'; }, 1600);
      } catch (_) {
        showErr('Could not copy booking link');
      }
    });
    bootstrap();
  })();
  </script>`
    : ''

  const filesScript =
    isCalendar || isMeetings
      ? ''
      : `
  <script>
  (function () {
    var panel = document.querySelector('main.panel');
    if (!panel) return;
    var filter = panel.getAttribute('data-filter') || '';
    var errEl = document.getElementById('err');
    function showErr(msg) {
      if (!errEl) return;
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
    }
    function fmtDate(iso) {
      try { return new Date(iso).toLocaleString(); } catch (_) { return iso; }
    }
    async function loadFiles() {
      var list = document.getElementById('file-list');
      if (!list) return;
      var q = filter ? ('?kind=' + encodeURIComponent(filter)) : '';
      var r = await fetch('/api/files' + q, { credentials: 'same-origin' });
      if (!r.ok) { list.innerHTML = '<div class="empty">Could not load files</div>'; return; }
      var data = await r.json();
      var files = (data && data.files) || [];
      if (!files.length) {
        list.innerHTML = '<div class="empty">No files yet — create a Doc, Sheet, or Presentation to get started.</div>';
        return;
      }
      var rows = files.map(function (f) {
        return '<tr>' +
          '<td><a href="/editor/' + encodeURIComponent(f.id) + '">' + escapeHtml(f.name) + '</a></td>' +
          '<td>' + escapeHtml(f.kind) + '</td>' +
          '<td>' + fmtDate(f.updatedAt) + '</td>' +
          '<td><button type="button" data-del="' + escapeHtml(f.id) + '">Delete</button></td>' +
          '</tr>';
      }).join('');
      list.innerHTML = '<table><thead><tr><th>Name</th><th>Type</th><th>Updated</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
      list.querySelectorAll('[data-del]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!confirm('Delete this file?')) return;
          var id = btn.getAttribute('data-del');
          var dr = await fetch('/api/files/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
          if (!dr.ok) { showErr('Delete failed'); return; }
          loadFiles();
        });
      });
    }
    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    async function create(kind) {
      showErr('');
      var name = prompt(kind === 'sheet' ? 'Sheet name' : kind === 'slide' ? 'Presentation name' : 'Document name', 'Untitled');
      if (!name) return;
      var r = await fetch('/api/files', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, kind: kind })
      });
      if (!r.ok) {
        var body = {};
        try { body = await r.json(); } catch (_) {}
        showErr(body.error || ('Create failed (' + r.status + ')'));
        return;
      }
      var created = await r.json();
      if (created && created.id) location.href = '/editor/' + encodeURIComponent(created.id);
      else loadFiles();
    }
    document.querySelectorAll('[data-kind]').forEach(function (btn) {
      btn.addEventListener('click', function () { create(btn.getAttribute('data-kind')); });
    });
    loadFiles();
  })();
  </script>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Indobase Workspace</title>
  <link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
  <style>${STYLES}</style>
</head>
<body>
  <header class="appbar">
    <img class="mark" src="/brand/indobase-logo-mark.svg" alt="" width="28" height="28" />
    <div class="title"><span>Indobase</span> Workspace</div>
    <span class="pill">${esc(opts.map.projectTitle)}</span>
    <div class="spacer"></div>
    <span class="meta">${esc(opts.session.email)}</span>
    <a class="studio" href="${esc(opts.studioUrl)}/project/${esc(opts.session.projectRef)}">Studio</a>
  </header>
  <div class="layout">
    <nav class="rail">${rail}</nav>
    <main class="panel" data-home="${esc(home)}" data-module="${esc(active)}" data-filter="${esc(
      createKind || ''
    )}">
      ${body}
    </main>
  </div>
  ${meetingsScript}
  ${calendarScript}
  ${filesScript}
</body>
</html>`
}

export function renderEditorPage(opts: {
  session: Session
  map: WorkspaceMap
  fileName: string
  editor: EditorConfigBundle
  studioUrl: string
}): string {
  const configJson = JSON.stringify({ ...opts.editor.config, token: opts.editor.token })
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.fileName)} · Indobase Workspace</title>
  <link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
  <style>
    ${STYLES}
    body { background: #0f172a; }
    header.appbar { background: #0f172a; border-color: #1e293b; color: #e2e8f0; }
    header.appbar .meta, header.appbar a.studio { color: #94a3b8; }
    header.appbar .pill { background: #1e3a5f; color: #93c5fd; }
    #editor { position: absolute; inset: 52px 0 0 0; }
    .boot { color: #94a3b8; padding: 24px; font-size: 14px; }
  </style>
  <script src="${esc(opts.editor.documentServerApiJs)}"></script>
</head>
<body>
  <header class="appbar">
    <img class="mark" src="/brand/indobase-logo-mark.svg" alt="" width="28" height="28" />
    <div class="title"><span>Indobase</span> Workspace</div>
    <span class="pill">${esc(opts.fileName)}</span>
    <div class="spacer"></div>
    <a class="studio" href="/">← Files</a>
    <a class="studio" href="${esc(opts.studioUrl)}/project/${esc(opts.session.projectRef)}">Studio</a>
  </header>
  <div id="editor"><p class="boot">Opening editor…</p></div>
  <script>
  (function () {
    var cfg = ${configJson};
    function start() {
      if (!window.DocsAPI || !window.DocsAPI.DocEditor) {
        document.getElementById('editor').innerHTML =
          '<p class="boot">Editor is starting up. Refresh in a few seconds if this persists.</p>';
        return;
      }
      document.getElementById('editor').innerHTML = '';
      new window.DocsAPI.DocEditor('editor', cfg);
    }
    if (window.DocsAPI) start();
    else window.addEventListener('load', start);
  })();
  </script>
</body>
</html>`
}

export function renderLaunchHtml(studioUrl: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Opening Indobase Workspace…</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#1e293b;background:#f8fafc">
<p>Opening Indobase Workspace…</p>
<script>
(async () => {
  var h = new URLSearchParams(location.hash.slice(1));
  var t = h.get('token');
  if (!t) { location.replace(${JSON.stringify(studioUrl)} + '/sign-in'); return; }
  history.replaceState(null, '', '/sso/launch' + location.search);
  var r = await fetch('/sso/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t })
  });
  if (!r.ok) {
    var reason = '';
    try { reason = ((await r.json()) || {}).error || ''; } catch (_) {}
    document.body.innerHTML =
      '<div style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;padding:24px;text-align:center;color:#1e293b">' +
      '<div style="max-width:34rem"><p style="font-weight:600;margin:0 0 8px">Could not open this workspace</p>' +
      '<p style="margin:0 0 8px;color:#475569;font-size:14px">' + (reason || ('The handoff was rejected (HTTP ' + r.status + ').')) + '</p>' +
      (r.status === 401
        ? '<p style="margin:0 0 16px;color:#64748b;font-size:13px">This usually means the handoff secret does not match between Studio and this service.</p>'
        : '') +
      '<a href="' + ${JSON.stringify(studioUrl)} + '" style="font-size:14px;color:#2563eb">Back to Indobase Studio</a></div></div>';
    return;
  }
  var dest = '/';
  try {
    var body = await r.json();
    if (body && body.redirect) dest = body.redirect;
  } catch (_) {}
  location.replace(dest);
})();
</script></body>`
}
