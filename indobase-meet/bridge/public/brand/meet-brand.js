/* Indobase Meet brand layer.
 * Served from /brand/ rather than inlined: if the upstream shell ships its own
 * `<meta http-equiv="Content-Security-Policy" content="script-src 'self' …">`, an inline
 * <script> is refused and silently never runs — the exact failure that left Indobase
 * Discuss unbranded in production. 'self' permits this. Do not inline it again.
 */
(function () {
  window.__INDOBASE_BRAND_JS = "loaded";
  var PRODUCT = "Indobase Meet";
  var RE = /\bJitsi(\s+Meet)?\b/gi;
  var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, CODE:1, PRE:1 };

  function rewriteText(node) {
    if (!node || node.nodeType !== 3) return;
    var p = node.parentElement;
    if (p && SKIP[p.tagName]) return;
    var v = node.nodeValue;
    if (!v || !RE.test(v)) return;
    RE.lastIndex = 0;
    node.nodeValue = v.replace(RE, PRODUCT);
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
      if (v && RE.test(v)) {
        RE.lastIndex = 0;
        el.setAttribute(a, v.replace(RE, PRODUCT));
      }
    });
  }

  function boot() {
    try { document.title = PRODUCT; } catch (_) {}
    walk(document.documentElement);
    document.querySelectorAll("[alt],[aria-label],[title],[placeholder]").forEach(patchAttrs);
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
                node.querySelectorAll("[alt],[aria-label],[title],[placeholder]").forEach(patchAttrs);
              }
            }
          }
        }
      }
    });
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
