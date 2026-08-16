/**
 * Persistent merchant admin chrome: Search, Ask toggle, Profile, Attachment.
 * Operator-facing copy only — no engine names.
 */

export const MERCHANT_OS_TOPBAR_ID = 'ib-merchant-top'

const TOPBAR_CSS = `
#ib-merchant-top {
  position: fixed; top: 0; left: 0; right: 0; z-index: 70;
  height: 56px; display: grid;
  grid-template-columns: 1fr minmax(240px, 42rem) 1fr;
  align-items: center; gap: .75rem;
  padding: 0 1rem;
  background: #1a1c1d; color: #f1f2f4;
  border-bottom: 1px solid #111;
  font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
}
#ib-merchant-search { grid-column: 2; position: relative; margin: 0; }
#ib-merchant-search input {
  width: 100%; height: 36px; border: 0; border-radius: 999px;
  background: #303030; color: #f1f2f4;
  padding: 0 1rem 0 2.15rem; font: 500 14px/1 system-ui, sans-serif;
}
#ib-merchant-search input::placeholder { color: #b5b5b5; }
#ib-merchant-search .ib-search-icon {
  position: absolute; left: .75rem; top: 50%; transform: translateY(-50%);
  width: 16px; height: 16px; pointer-events: none; opacity: .75;
}
#ib-merchant-top-actions {
  grid-column: 3; justify-self: end; display: flex; align-items: center; gap: .45rem;
}
#ib-ask-toggle, #ib-profile {
  appearance: none; border: 0; cursor: pointer;
  width: 36px; height: 36px; border-radius: 999px;
  background: #303030; color: #f1f2f4;
  display: inline-flex; align-items: center; justify-content: center;
}
#ib-ask-toggle[aria-pressed="true"] { background: #3B8FD6; color: #fff; }
#ib-profile {
  font: 700 12px/1 system-ui, sans-serif;
  background: #4a4a4a; letter-spacing: .02em;
}
#ib-merchant-top svg { display: block; }
html.indobase-merchant-os body { padding-top: 56px; }
.ib-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
.ib-attach, button.ib-attach {
  appearance: none; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 999px;
  border: 1px solid #e3e4e5; background: #fff; color: #1a1a1a;
  font: 700 18px/1 system-ui, sans-serif; cursor: pointer;
}
html.indobase-merchant-os [data-slot="header"],
html.indobase-merchant-os nav[aria-label="Main"] { display: none !important; }
html.indobase-merchant-os .ib-merchant { padding-top: 0; }
html[data-ib-ask-open="0"] .ib-merchant { grid-template-columns: 220px minmax(0,1fr) !important; }
html[data-ib-ask-open="0"] .ib-merchant-ask { display: none !important; }
@media (min-width: 960px) {
  html[data-ib-surface="chat"] body > #root,
  html[data-ib-surface="chat"] body > #app { top: 56px !important; height: calc(100% - 56px) !important; }
  html[data-ib-ask-open="0"][data-ib-surface="chat"] body > #root,
  html[data-ib-ask-open="0"][data-ib-surface="chat"] body > #app { display: none !important; }
  html[data-ib-ask-open="0"] .askDock { display: none !important; }
}
`

const TOPBAR_HTML = `
<style id="ib-merchant-top-css">${TOPBAR_CSS.replace(/\s+/g, ' ').trim()}</style>
<div id="${MERCHANT_OS_TOPBAR_ID}" role="banner">
  <form id="ib-merchant-search" role="search">
    <label class="ib-visually-hidden" for="ib-merchant-search-input">Search</label>
    <svg class="ib-search-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.4 10.4 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    <input id="ib-merchant-search-input" type="search" name="q" placeholder="Search" autocomplete="off" />
  </form>
  <div id="ib-merchant-top-actions">
    <button type="button" id="ib-ask-toggle" aria-label="Open Ask" aria-pressed="true" title="Ask">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 13.5V4.8a1.2 1.2 0 0 1 1.2-1.2h7.6A1.2 1.2 0 0 1 14 4.8v6.1a1.2 1.2 0 0 1-1.2 1.2H7.1L4 13.5z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 7.2h4M7 9.4h2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
    <button type="button" id="ib-profile" aria-label="Profile" title="Profile">U</button>
  </div>
</div>
<input id="ib-attach-file" class="ib-visually-hidden" type="file" multiple accept="image/*,.pdf,.csv,.txt" />
`

const TOPBAR_SCRIPT = `
<script>
(function () {
  if (window.__INDOBASE_MERCHANT_TOP__) return;
  window.__INDOBASE_MERCHANT_TOP__ = true;
  var html = document.documentElement;
  html.classList.add('indobase-merchant-os');
  if (!html.getAttribute('data-ib-ask-open')) html.setAttribute('data-ib-ask-open', '1');

  function initials() {
    try {
      var name = window.__INDOBASE_DISPLAY_NAME__ || (window.__INDOBASE_AUTH__ && window.__INDOBASE_AUTH__.email) || '';
      var s = String(name).trim();
      if (!s) return 'U';
      var parts = s.split(/\\s+/);
      var a = parts[0][0] || '';
      var b = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || '');
      return (a + b).toUpperCase();
    } catch (_) { return 'U'; }
  }
  function paintProfile() {
    var btn = document.getElementById('ib-profile');
    if (btn) btn.textContent = initials();
  }
  paintProfile();
  window.addEventListener('indobase:context', paintProfile);
  window.addEventListener('indobase:runtime-updated', paintProfile);

  var askBtn = document.getElementById('ib-ask-toggle');
  function setAsk(open) {
    html.setAttribute('data-ib-ask-open', open ? '1' : '0');
    if (askBtn) {
      askBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
      askBtn.setAttribute('aria-label', open ? 'Close Ask' : 'Open Ask');
    }
    window.dispatchEvent(new CustomEvent('indobase:ask-toggle', { detail: { open: !!open } }));
  }
  if (askBtn) askBtn.addEventListener('click', function () {
    setAsk(html.getAttribute('data-ib-ask-open') !== '1');
  });

  var profile = document.getElementById('ib-profile');
  if (profile) profile.addEventListener('click', function () {
    if (typeof window.__INDOBASE_OPEN_AUTH__ === 'function' && (window.__INDOBASE_GUEST__ || window.__INDOBASE_SESSION_STAGE__ === 'guest')) {
      window.__INDOBASE_OPEN_AUTH__();
      return;
    }
    window.dispatchEvent(new CustomEvent('indobase:run-action', { detail: { id: 'settings' } }));
    var settings = document.querySelector('[aria-label="Business"] button[data-id="settings"]');
    if (settings) settings.click();
  });

  var form = document.getElementById('ib-merchant-search');
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = document.getElementById('ib-merchant-search-input');
    var q = input && input.value ? String(input.value).trim() : '';
    if (!q) return;
    window.dispatchEvent(new CustomEvent('indobase:search', { detail: { q: q } }));
    setAsk(true);
    var dest = document.querySelector('.ib-merchant-ask input, [aria-label="Ask Indobase"], textarea, [placeholder*="Ask"]');
    if (dest) {
      dest.focus();
      try { dest.value = q; dest.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    }
  });

  var file = document.getElementById('ib-attach-file');
  function noteFiles(list) {
    if (!list || !list.length) return;
    var names = [];
    for (var i = 0; i < list.length; i++) names.push(list[i].name);
    var line = 'Attached: ' + names.join(', ');
    var dest = document.querySelector('.ib-merchant-ask input, [aria-label="Ask Indobase"], textarea, [placeholder*="Ask"]');
    if (dest) {
      dest.value = ((dest.value || '') + (dest.value ? ' ' : '') + line).trim();
      try { dest.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('indobase:attach', { detail: { names: names } }));
  }
  if (file) file.addEventListener('change', function () { noteFiles(file.files); file.value = ''; });

  function ensureAttach(formEl) {
    if (!formEl || formEl.getAttribute('data-ib-attach') === '1') return;
    if (formEl.querySelector('.ib-attach, [aria-label="Attachment"]')) {
      formEl.setAttribute('data-ib-attach', '1');
      return;
    }
    if (!formEl.querySelector('textarea, input, [contenteditable="true"]')) return;
    formEl.setAttribute('data-ib-attach', '1');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ib-attach';
    btn.setAttribute('aria-label', 'Attachment');
    btn.title = 'Attachment';
    btn.textContent = '+';
    btn.addEventListener('click', function () { if (file) file.click(); });
    formEl.insertBefore(btn, formEl.firstChild);
  }
  function scan() {
    document.querySelectorAll('form').forEach(function (f) {
      if (f.id === 'ib-merchant-search') return;
      if (f.querySelector('textarea, [placeholder*="Ask"], [contenteditable="true"]')) ensureAttach(f);
    });
  }
  scan();
  try {
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  } catch (_) {}
})();
</script>
`

export function merchantOsTopbarMarkup(): string {
  return `${TOPBAR_HTML}${TOPBAR_SCRIPT}`
}

export function injectMerchantOsTopbar(html: string): string {
  if (html.includes(`id="${MERCHANT_OS_TOPBAR_ID}"`)) return html
  const markup = merchantOsTopbarMarkup()
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${markup}</body>`)
  return `${html}${markup}`
}
