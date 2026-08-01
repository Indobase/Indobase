/* Indobase Discuss brand layer.
 * Served from /brand/ (not inlined) so upstream CSP script-src 'self' cannot
 * silently block rebranding — see Calendar bridge notes.
 */
(function () {
  window.__INDOBASE_BRAND_JS = 'loaded'
  var PRODUCT = 'Indobase Discuss'
  var SHORT = 'Discuss'
  var PHRASES = [
    [/Frappe\s+Gameplan/gi, PRODUCT],
    [/\bGameplan\b/g, SHORT],
  ]
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 }

  function applyPhrases(text) {
    if (!text) return text
    var out = text
    for (var i = 0; i < PHRASES.length; i++) {
      out = out.replace(PHRASES[i][0], PHRASES[i][1])
    }
    return out
  }

  function rewriteText(node) {
    if (!node || node.nodeType !== 3) return
    var p = node.parentElement
    if (p && SKIP[p.tagName]) return
    var v = node.nodeValue
    if (!v) return
    var n = applyPhrases(v)
    if (n !== v) node.nodeValue = n
  }

  function walk(root) {
    if (!root) return
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
    var n
    while ((n = w.nextNode())) rewriteText(n)
  }

  function patchAttrs(el) {
    if (!el || !el.getAttribute) return
    ;['alt', 'aria-label', 'title', 'placeholder'].forEach(function (a) {
      var v = el.getAttribute(a)
      if (!v) return
      var n = applyPhrases(v)
      if (n !== v) el.setAttribute(a, n)
    })
  }

  function boot() {
    try {
      document.title = PRODUCT
    } catch (_) {}
    walk(document.documentElement)
    document.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach(patchAttrs)
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i]
        if (m.type === 'characterData') rewriteText(m.target)
        else if (m.addedNodes) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j]
            if (node.nodeType === 3) rewriteText(node)
            else if (node.nodeType === 1) {
              walk(node)
              patchAttrs(node)
              if (node.querySelectorAll) {
                node.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach(patchAttrs)
              }
            }
          }
        }
      }
    })
    obs.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
