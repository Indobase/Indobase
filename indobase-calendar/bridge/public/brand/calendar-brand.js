/* Indobase Calendar brand layer.
 * Served from /brand/ rather than inlined: if the upstream shell ships its own
 * `<meta http-equiv="Content-Security-Policy" content="script-src 'self' …">`, an inline
 * <script> is refused and silently never runs — the exact failure that left Indobase
 * Discuss unbranded in production. 'self' permits this. Do not inline it again.
 */
(function () {
  window.__INDOBASE_BRAND_JS = "loaded";
  var PRODUCT = "Indobase Calendar";
  var PHRASES = [
    [/\bCal\\.com,\s*Inc\\.?\b/gi, 'Indobase'],
    [/\bCal\\.com\b/g, PRODUCT],
    [/\bcal\\.diy\b/gi, PRODUCT],
    [/\bCalendly\b/gi, PRODUCT],
    [/\bWelcome to Cal\b/gi, 'Welcome to ' + PRODUCT],
    [/\bsupport@cal\\.com\b/gi, 'support@indobase.in'],
    [/\bPowered by Cal\b/gi, PRODUCT]
  ];
  var HOST = /(?:^|[/.@])cal\\.(?:com|diy)(?:[/]|$)/i;
  var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, CODE:1, PRE:1 };

  function applyPhrases(text) {
    if (!text) return text;
    var out = text;
    for (var i = 0; i < PHRASES.length; i++) {
      out = out.replace(PHRASES[i][0], PHRASES[i][1]);
    }
    return out;
  }

  function rewriteText(node) {
    if (!node || node.nodeType !== 3) return;
    var p = node.parentElement;
    if (p && SKIP[p.tagName]) return;
    var v = node.nodeValue;
    if (!v) return;
    var n = applyPhrases(v);
    if (n !== v) node.nodeValue = n;
  }

  function walk(root) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) rewriteText(n);
  }

  function patchAttrs(el) {
    if (!el || !el.getAttribute) return;
    ["alt","aria-label","title","placeholder"].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v) {
        var n = applyPhrases(v);
        if (n !== v) el.setAttribute(a, n);
      }
    });
    if (el.tagName === 'A') {
      var href = el.getAttribute('href') || '';
      if (HOST.test(href) || href.indexOf('go.cal.com') !== -1) {
        el.setAttribute('href', '#');
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
      }
    }
  }

  function scrubCredits() {
    document.querySelectorAll('a[href*="cal.com"], a[href*="cal.diy"], a[href*="go.cal.com"]').forEach(function (a) {
      a.setAttribute('href', '#');
      a.style.display = 'none';
      a.setAttribute('aria-hidden', 'true');
      var sm = a.closest('small');
      if (sm && sm.textContent && /cal\\.com|go\\.cal/i.test(sm.textContent)) sm.style.display = 'none';
    });
  }

  function mountMeetChip(meet) {
    if (!meet || !meet.enabled || !meet.meetLink) return;
    if (document.getElementById('indobase-meet-attach-chip')) return;
    var bar = document.createElement('div');
    bar.id = 'indobase-meet-attach-chip';
    bar.setAttribute(
      'style',
      'position:fixed;z-index:2147483000;right:16px;bottom:16px;max-width:min(420px,92vw);' +
        'background:#0f172a;color:#f8fafc;border-radius:12px;padding:12px 14px;' +
        'box-shadow:0 10px 30px rgba(15,23,42,.28);font:13px/1.4 system-ui,sans-serif'
    );
    var title = document.createElement('div');
    title.textContent = 'Meet room linked';
    title.setAttribute('style', 'font-weight:600;margin:0 0 4px;color:#3B8FD6');
    var id = document.createElement('div');
    id.textContent = meet.meetingId || '';
    id.setAttribute('style', 'font-size:11px;opacity:.8;word-break:break-all;margin:0 0 8px');
    var row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap');
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy invite';
    copy.setAttribute(
      'style',
      'border:0;border-radius:8px;padding:8px 12px;background:#1e293b;color:#fff;cursor:pointer;font-weight:600'
    );
    copy.onclick = function () {
      try {
        navigator.clipboard.writeText(meet.meetLink);
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy invite'; }, 1200);
      } catch (_) {}
    };
    var open = document.createElement('a');
    open.href = meet.launchUrl || meet.meetLink;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'Open Meet';
    open.setAttribute(
      'style',
      'border-radius:8px;padding:8px 12px;background:#3B8FD6;color:#fff;text-decoration:none;font-weight:600'
    );
    row.appendChild(copy);
    row.appendChild(open);
    bar.appendChild(title);
    bar.appendChild(id);
    bar.appendChild(row);
    document.body.appendChild(bar);
  }

  function boot() {
    try { document.title = PRODUCT; } catch (_) {}
    walk(document.documentElement);
    document.querySelectorAll("[alt],[aria-label],[title],[placeholder],a[href]").forEach(patchAttrs);
    scrubCredits();
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData") rewriteText(m.target);
        else if (m.addedNodes) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType === 3) rewriteText(node);
            else if (node.nodeType === 1) {
              walk(node);
              patchAttrs(node);
              if (node.querySelectorAll) {
                node.querySelectorAll("[alt],[aria-label],[title],[placeholder],a[href]").forEach(patchAttrs);
              }
            }
          }
        }
        scrubCredits();
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    fetch('/api/meet', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        if (body && body.meet) mountMeetChip(body.meet);
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
