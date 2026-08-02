/**
 * Indobase Workspace HTML shell — file manager + editor host.
 * Brand assets from /brand/*; never name upstream engines in chrome.
 */

import type { Session } from './auth.js'
import type { EditorConfigBundle } from './onlyoffice.js'
import type { WorkspaceFileMeta } from './files.js'
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

/** Tiny inline SVGs — color matches Studio WorkspaceLauncher accents. */
const RAIL_ICONS: Record<SuiteModuleId, string> = {
  files:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/></svg>',
  sheets:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  presentations:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#9333EA" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  meetings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" aria-hidden="true"><path d="M15 10l4.5-2.5v9L15 14M5 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
}

const STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   Indobase Workspace — Frappe Suite-style token layer.

   Frappe UI names tokens semantically by ROLE, not by literal colour:
     surface-*  backgrounds, layered from page to raised card
     ink-*      foreground text, from strongest to faintest
     outline-*  borders and dividers
   Naming by role is what makes dark mode a token swap rather than a rewrite,
   so the same convention is used here.

   Measured contrast on --surface-white (#ffffff), WCAG 2.2:
     --ink-1   #171717  16.1:1  AAA
     --ink-2   #383838   10.4:1  AAA
     --ink-3   #525252   7.5:1   AAA
     --ink-4   #6b6b6b   5.3:1   AA   ← faintest permitted for body text
     --accent  #2B6CA3   5.6:1   AA   ← brand blue darkened for TEXT
     --brand   #3B8FD6   3.45:1  FAILS AA for text — non-text only (rings, fills)
   ═══════════════════════════════════════════════════════════════════════════ */
:root, [data-theme="light"] {
  color-scheme: light;

  --surface-white: #ffffff;
  --surface-1: #fafafa;
  --surface-2: #f4f4f5;
  --surface-3: #ededee;
  --surface-selected: #f0f6fc;

  --ink-1: #171717;
  --ink-2: #383838;
  --ink-3: #525252;
  --ink-4: #6b6b6b;

  --outline-1: #e8e8e9;
  --outline-2: #dcdcdd;
  --outline-3: #c4c4c6;

  /* Brand. --brand is decorative only; --accent is the text-safe variant. */
  --brand: #3B8FD6;
  --accent: #2B6CA3;
  --accent-hover: #235980;
  --on-accent: #ffffff;

  --danger: #b3261e;
  --ok: #077d55;

  --radius-sm: 5px;
  --radius: 8px;
  --radius-lg: 10px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px var(--outline-1);
  --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px var(--outline-1);
}

[data-theme="dark"] {
  color-scheme: dark;

  --surface-white: #1c1c1f;
  --surface-1: #171719;
  --surface-2: #232326;
  --surface-3: #2b2b2f;
  --surface-selected: #1b2b3a;

  --ink-1: #f2f2f3;
  --ink-2: #d4d4d6;
  --ink-3: #a8a8ac;
  --ink-4: #8a8a8f;

  --outline-1: #2e2e32;
  --outline-2: #3a3a3f;
  --outline-3: #4a4a50;

  /* On dark surfaces the lighter blue clears AA, so it becomes the text colour. */
  --accent: #6FB2E8;
  --accent-hover: #8CC3EF;
  --on-accent: #0f1720;

  --danger: #f2b8b5;
  --ok: #6ee7b7;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px var(--outline-1);
  --shadow: 0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px var(--outline-1);
}

/* Legacy aliases — older rules in this file still reference these names. */
:root, [data-theme="light"], [data-theme="dark"] {
  --ink: var(--ink-1);
  --muted: var(--ink-4);
  --surface: var(--surface-white);
  --bg: var(--surface-1);
  --border: var(--outline-1);
  --brand-ink: var(--accent);
}

* { box-sizing: border-box; }
html { scrollbar-width: thin; }
body {
  margin: 0;
  /* Inter is Frappe UI's face; the stack degrades to the platform UI font. */
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  font-feature-settings: "cv11", "ss01";
  -webkit-font-smoothing: antialiased;
  background: var(--surface-1);
  color: var(--ink-1);
  min-height: 100vh;
}
a { color: var(--accent); }
a:hover { color: var(--accent-hover); }

/* Never remove focus rings — keyboard users lose all position feedback. */
:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
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
/* Ecosystem switcher. <details> keeps it keyboard-accessible with no JS. */
header.appbar .switcher { position: relative; }
header.appbar .switcher > summary {
  list-style: none; cursor: pointer; font-size: 13px; color: var(--ink-3);
  padding: 5px 10px; border: 1px solid var(--outline-2); border-radius: var(--radius-sm);
  background: var(--surface-white); user-select: none;
}
header.appbar .switcher > summary::-webkit-details-marker { display: none; }
header.appbar .switcher > summary:hover { color: var(--ink-1); background: var(--surface-2); }
header.appbar .switcher .switcher-menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; min-width: 190px;
  background: var(--surface-white); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 5px; display: flex; flex-direction: column;
}
header.appbar .switcher .switcher-menu a {
  padding: 7px 10px; border-radius: var(--radius-sm); font-size: 13px;
  color: var(--ink-2); text-decoration: none;
}
header.appbar .switcher .switcher-menu a:hover { background: var(--surface-2); color: var(--ink-1); }
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
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  text-decoration: none; color: var(--ink); font-size: 14px; font-weight: 500;
}
nav.rail a .ico {
  width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0;
}
nav.rail a .ico svg { width: 16px; height: 16px; }
nav.rail a[data-mod="files"] .ico { background: #0D948810; }
nav.rail a[data-mod="docs"] .ico { background: #2563EB10; }
nav.rail a[data-mod="sheets"] .ico { background: #16A34A10; }
nav.rail a[data-mod="presentations"] .ico { background: #9333EA10; }
nav.rail a[data-mod="meetings"] .ico { background: #DC262610; }
nav.rail a[data-mod="mail"] .ico { background: #0EA5E910; }
nav.rail a[data-mod="calendar"] .ico { background: #F9731610; }
nav.rail a:hover { background: #f8fafc; }
nav.rail a.active { background: #eff6ff; color: var(--brand-ink); }
main.panel { padding: 24px 28px; max-width: 1100px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 18px; }
.toolbar h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; flex: 1; min-width: 160px; }
.toolbar .create-group { display: flex; align-items: center; gap: 8px; }
button, .btn {
  appearance: none; border: 1px solid var(--border); background: var(--surface);
  color: var(--ink); padding: 8px 14px; border-radius: 8px; font-size: 13px;
  font-weight: 550; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
button.primary, .btn.primary {
  background: var(--brand); border-color: var(--brand); color: #fff;
}
button:disabled { opacity: 0.55; cursor: not-allowed; }
.create-more { position: relative; }
.create-more summary {
  list-style: none; cursor: pointer; border: 1px solid var(--border); background: var(--surface);
  padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 550; color: var(--muted);
}
.create-more summary::-webkit-details-marker { display: none; }
.create-more[open] summary { color: var(--ink); }
.create-more .menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 5;
  min-width: 180px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}
.create-more .menu button {
  width: 100%; border: none; background: transparent; justify-content: flex-start;
  border-radius: 6px; font-weight: 500;
}
.create-more .menu button:hover { background: #f8fafc; }
.table {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
}
.table table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th, .table td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.table th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: #f8fafc; }
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: #fafbfc; }
.table a.file-link {
  color: var(--ink); font-weight: 550; text-decoration: none;
}
.table a.file-link:hover { color: var(--brand); text-decoration: underline; }
.chip {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 550;
  background: #f1f5f9; color: #334155;
}
.chip.doc { background: #2563EB14; color: #1d4ed8; }
.chip.sheet { background: #16A34A14; color: #15803d; }
.chip.slide { background: #9333EA14; color: #7e22ce; }
button.danger-link {
  border: none; background: transparent; color: var(--danger);
  padding: 4px 6px; font-size: 13px; font-weight: 500; opacity: 0.85;
}
button.danger-link:hover { opacity: 1; text-decoration: underline; }
.empty { padding: 40px 20px; text-align: center; color: var(--muted); font-size: 14px; }
.launch-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 28px; max-width: 640px; box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}
.launch-card .eyebrow {
  display: inline-block; font-size: 11px; font-weight: 650; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--brand-ink); margin-bottom: 10px;
}
.launch-card h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.02em; }
.launch-card .lede { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.launch-card .room {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; background: #f8fafc; border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 12px; margin: 0 0 16px; word-break: break-all;
}
.launch-card .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 4px; }
.launch-card .actions .btn.primary { padding: 10px 18px; font-size: 14px; }
.dialog-backdrop {
  border: none; padding: 0; margin: 0; background: rgba(15, 23, 42, 0.35);
  max-width: none; max-height: none; width: 100%; height: 100%;
}
.dialog-backdrop::backdrop { background: rgba(15, 23, 42, 0.35); }
.dialog-card {
  background: var(--surface); border-radius: 14px; border: 1px solid var(--border);
  padding: 20px; width: min(400px, calc(100vw - 32px));
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
}
.dialog-card h2 { margin: 0 0 6px; font-size: 16px; }
.dialog-card p { margin: 0 0 14px; font-size: 13px; color: var(--muted); }
.dialog-card label { display: block; font-size: 12px; font-weight: 550; color: var(--muted); margin-bottom: 6px; }
.dialog-card input[type="text"] {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; margin-bottom: 16px;
}
.dialog-card input[type="text"]:focus { outline: 2px solid #bfdbfe; border-color: var(--brand); }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.err { color: #b91c1c; font-size: 13px; margin-top: 8px; }
@media (max-width: 800px) {
  .layout { grid-template-columns: 1fr; }
  nav.rail { flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid var(--border); }
}
`

/**
 * Sibling Indobase products, for the ecosystem switcher.
 *
 * Every entry links through Studio (`/project/:ref/<product>`) rather than straight at the product
 * host. A direct link would arrive with no handoff token and bounce the user to sign-in — Studio is
 * the only thing that can mint one. This is what makes Workspace feel like part of one OS instead
 * of a standalone app that happens to share a logo.
 */
const ECOSYSTEM_LINKS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: '', label: 'Project home' },
  { slug: 'builder', label: 'Builder' },
  { slug: 'backend', label: 'Backend Studio' },
  { slug: 'payments', label: 'Payments' },
  { slug: 'analytics', label: 'Analytics' },
]

function renderEcosystemSwitcher(studioUrl: string, projectRef: string): string {
  const base = `${studioUrl}/project/${encodeURIComponent(projectRef)}`
  const items = ECOSYSTEM_LINKS.map(
    (p) => `<a role="menuitem" href="${esc(p.slug ? `${base}/${p.slug}` : base)}">${esc(p.label)}</a>`
  ).join('')
  return `<details class="switcher">
    <summary aria-label="Switch Indobase product" title="Switch product">Products</summary>
    <div class="switcher-menu" role="menu">${items}</div>
  </details>`
}

function studioWorkspaceHref(studioUrl: string, projectRef: string): string {
  return `${studioUrl}/project/${encodeURIComponent(projectRef)}/workspace`
}

function kindLabelServer(kind: string): string {
  if (kind === 'sheet') return 'Sheet'
  if (kind === 'slide') return 'Presentation'
  return 'Doc'
}

function fmtDateServer(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

/** Server-rendered file table so module navigations skip the Loading… flash. */
export function renderFileListHtml(files: WorkspaceFileMeta[]): string {
  if (!files.length) {
    return `<div class="empty" data-ssr="1">No files yet — create a Doc, Sheet, or Presentation to get started.</div>`
  }
  const rows = files
    .map((f) => {
      const label = kindLabelServer(f.kind)
      const chipClass = `chip ${f.kind === 'sheet' || f.kind === 'slide' ? f.kind : 'doc'}`
      return `<tr>
          <td><a class="file-link" href="/editor/${encodeURIComponent(f.id)}">${esc(f.name)}</a></td>
          <td><span class="${chipClass}">${esc(label)}</span></td>
          <td><span title="${esc(f.updatedAt)}">${esc(fmtDateServer(f.updatedAt))}</span></td>
          <td><button type="button" class="danger-link" data-del="${esc(f.id)}" data-name="${esc(f.name)}" aria-label="Delete ${esc(f.name)}">Delete</button></td>
        </tr>`
    })
    .join('')
  return `<div data-ssr="1"><table><thead><tr><th>Name</th><th>Type</th><th>Updated</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
}

export function renderWorkspaceShell(opts: {
  session: Session
  map: WorkspaceMap
  activeModule?: SuiteModuleId
  studioUrl: string
  /** When set, Files/Docs/Sheets/Presentations render this list instead of "Loading…". */
  initialFiles?: WorkspaceFileMeta[]
}): string {
  const home = workspaceHomePath(opts.map)
  const modules = listModulesForApi()
  const active = opts.activeModule || 'files'
  const studioBack = studioWorkspaceHref(opts.studioUrl, opts.session.projectRef)
  const rail = modules
    .map((m) => {
      const href =
        m.externalProduct === 'email'
          ? `${opts.studioUrl}/project/${encodeURIComponent(opts.session.projectRef)}/workspace?open=mail`
          : modulePath(opts.map, m.id)
      const cls = active === m.id ? 'active' : ''
      const icon = RAIL_ICONS[m.id] || ''
      return `<a class="${cls}" data-mod="${esc(m.id)}" href="${esc(href)}"><span class="ico">${icon}</span><span>${esc(m.label)}</span></a>`
    })
    .join('')

  const isCalendar = active === 'calendar'
  const isMeetings = active === 'meetings'
  const createKind =
    active === 'docs' ? 'doc' : active === 'sheets' ? 'sheet' : active === 'presentations' ? 'slide' : ''

  const projectLabel = esc(opts.map.projectTitle)

  let body: string
  if (isCalendar) {
    body = `<div class="launch-card">
        <div class="eyebrow">${projectLabel}</div>
        <h1>Calendar</h1>
        <p class="lede">Open Indobase Calendar for this project — events, availability, and booking links. Signed in with your Studio session.</p>
        <div class="actions">
          <a class="btn primary" id="btn-open-calendar" href="#" rel="noopener">Open Calendar</a>
          <button type="button" id="btn-copy-calendar" disabled>Copy booking link</button>
        </div>
        <p class="err" id="err" hidden></p>
      </div>`
  } else if (isMeetings) {
    body = `<div class="launch-card">
        <div class="eyebrow">${projectLabel}</div>
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
    const createControls = createKind
      ? `<button class="primary" type="button" id="btn-create" data-kind="${createKind}">New ${esc(
          active === 'docs' ? 'Doc' : active === 'sheets' ? 'Sheet' : 'Presentation'
        )}</button>`
      : `<div class="create-group">
           <button class="primary" type="button" id="btn-create" data-kind="doc">New Doc</button>
           <details class="create-more">
             <summary>More</summary>
             <div class="menu">
               <button type="button" data-kind="sheet">New Sheet</button>
               <button type="button" data-kind="slide">New Presentation</button>
             </div>
           </details>
         </div>`

    body = `<div class="toolbar">
        <h1>${esc(modules.find((m) => m.id === active)?.label || 'Files')}</h1>
        ${createControls}
      </div>
      <div class="table"><div id="file-list">${
        opts.initialFiles
          ? renderFileListHtml(opts.initialFiles)
          : '<div class="empty">Loading…</div>'
      }</div></div>
      <p class="err" id="err" hidden></p>
      <dialog class="dialog-backdrop" id="create-dialog">
        <form class="dialog-card" method="dialog" id="create-form">
          <h2 id="create-title">New file</h2>
          <p id="create-hint">Choose a name for this file.</p>
          <label for="create-name">Name</label>
          <input id="create-name" name="name" type="text" maxlength="120" autocomplete="off" required />
          <div class="dialog-actions">
            <button type="submit" value="cancel">Cancel</button>
            <button class="primary" type="submit" value="create">Create</button>
          </div>
        </form>
      </dialog>`
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
    var dialog = document.getElementById('create-dialog');
    var form = document.getElementById('create-form');
    var nameInput = document.getElementById('create-name');
    var titleEl = document.getElementById('create-title');
    var hintEl = document.getElementById('create-hint');
    var pendingKind = 'doc';
    function showErr(msg) {
      if (!errEl) return;
      errEl.hidden = !msg;
      errEl.textContent = msg || '';
    }
    function kindLabel(kind) {
      if (kind === 'sheet') return 'Sheet';
      if (kind === 'slide') return 'Presentation';
      return 'Doc';
    }
    function fmtDate(iso) {
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        var now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        if (sameDay) {
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (_) { return iso; }
    }
    function fmtDateFull(iso) {
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
        var label = kindLabel(f.kind);
        var chipClass = 'chip ' + (f.kind === 'sheet' || f.kind === 'slide' ? f.kind : 'doc');
        return '<tr>' +
          '<td><a class="file-link" href="/editor/' + encodeURIComponent(f.id) + '">' + escapeHtml(f.name) + '</a></td>' +
          '<td><span class="' + chipClass + '">' + escapeHtml(label) + '</span></td>' +
          '<td><span title="' + escapeHtml(fmtDateFull(f.updatedAt)) + '">' + escapeHtml(fmtDate(f.updatedAt)) + '</span></td>' +
          '<td><button type="button" class="danger-link" data-del="' + escapeHtml(f.id) + '" data-name="' + escapeHtml(f.name) + '" aria-label="Delete ' + escapeHtml(f.name) + '">Delete</button></td>' +
          '</tr>';
      }).join('');
      list.innerHTML = '<div><table><thead><tr><th>Name</th><th>Type</th><th>Updated</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      bindDeletes(list);
    }
    function bindDeletes(root) {
      (root || document).querySelectorAll('[data-del]').forEach(function (btn) {
        if (btn.getAttribute('data-bound') === '1') return;
        btn.setAttribute('data-bound', '1');
        btn.addEventListener('click', async function () {
          var fname = btn.getAttribute('data-name') || 'this file';
          if (!confirm('Delete "' + fname + '"? This cannot be undone.')) return;
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
    function openCreate(kind) {
      pendingKind = kind || 'doc';
      var label = kindLabel(pendingKind);
      if (titleEl) titleEl.textContent = 'New ' + label;
      if (hintEl) hintEl.textContent = 'Name this ' + label.toLowerCase() + '.';
      if (nameInput) {
        nameInput.value = 'Untitled';
        nameInput.select();
      }
      showErr('');
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
      else {
        var fallback = prompt(label + ' name', 'Untitled');
        if (fallback) void submitCreate(fallback);
      }
    }
    async function submitCreate(name) {
      showErr('');
      var r = await fetch('/api/files', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, kind: pendingKind })
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
    if (form) {
      form.addEventListener('submit', function (ev) {
        var submitter = ev.submitter;
        var value = submitter && submitter.value;
        if (value === 'cancel') return;
        ev.preventDefault();
        var name = (nameInput && nameInput.value || '').trim();
        if (!name) return;
        if (dialog) dialog.close();
        void submitCreate(name);
      });
    }
    document.querySelectorAll('[data-kind]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var details = btn.closest('details');
        if (details) details.open = false;
        openCreate(btn.getAttribute('data-kind'));
      });
    });
    var listEl = document.getElementById('file-list');
    // SSR already painted the table — bind deletes and skip the Loading… remount flash.
    if (listEl && listEl.querySelector('[data-ssr="1"]')) {
      bindDeletes(listEl);
    } else {
      loadFiles();
    }
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
    ${renderEcosystemSwitcher(opts.studioUrl, opts.session.projectRef)}
    <a class="studio" href="${esc(studioBack)}">Studio</a>
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
  const configJson = JSON.stringify({
    documentServerUrl: opts.editor.documentServerUrl,
    ...opts.editor.config,
    token: opts.editor.token,
  })
  const studioBack = studioWorkspaceHref(opts.studioUrl, opts.session.projectRef)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.fileName)} · Indobase Workspace</title>
  <link rel="icon" href="/brand/indobase-favicon.svg" type="image/svg+xml" />
  <style>
    ${STYLES}
    #editor { position: absolute; inset: 52px 0 0 0; background: #fff; }
    .boot { color: var(--muted); padding: 24px; font-size: 14px; }
  </style>
  <script src="${esc(opts.editor.documentServerApiJs)}"
    onerror="window.__ibDocsApiFailed=true"></script>
</head>
<body>
  <header class="appbar">
    <img class="mark" src="/brand/indobase-logo-mark.svg" alt="" width="28" height="28" />
    <div class="title"><span>Indobase</span> Workspace</div>
    <span class="pill">${esc(opts.fileName)}</span>
    <div class="spacer"></div>
    <a class="studio" href="/">← Files</a>
    <a class="studio" href="${esc(studioBack)}">Studio</a>
  </header>
  <div id="editor"><p class="boot">Opening editor…</p></div>
  <script>
  (function () {
    var cfg = ${configJson};
    function fail(msg) {
      var el = document.getElementById('editor');
      if (el) el.innerHTML = '<p class="boot">' + msg + '</p>';
    }
    function start(attempt) {
      attempt = attempt || 0;
      if (window.__ibDocsApiFailed) {
        fail('Could not load the document editor. Check your connection and try again.');
        return;
      }
      if (!window.DocsAPI || !window.DocsAPI.DocEditor) {
        if (attempt < 12) {
          setTimeout(function () { start(attempt + 1); }, 350);
          return;
        }
        fail('Editor is starting up. Refresh in a few seconds if this persists.');
        return;
      }
      var el = document.getElementById('editor');
      if (!el) return;
      el.innerHTML = '';
      try {
        var events = Object.assign({}, cfg.events || {}, {
          onError: function (event) {
            console.error('[workspace] editor error', event);
            fail('The editor reported an error. Go back to Files and open the document again.');
          }
        });
        new window.DocsAPI.DocEditor('editor', Object.assign({}, cfg, { events: events }));
      } catch (err) {
        console.error('[workspace] editor boot failed', err);
        fail('Could not start the editor. Go back to Files and try again.');
      }
    }
    if (window.DocsAPI) start(0);
    else window.addEventListener('load', function () { start(0); });
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
