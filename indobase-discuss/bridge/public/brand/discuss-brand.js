/* Indobase Discuss brand layer. Served from /brand/ so Mattermost's CSP
 * (script-src 'self' …) permits it — an inline <script> is refused and silently
 * never runs, which is why this lived as dead code before. Do not inline it again.
 */
(function () {
  window.__INDOBASE_BRAND_JS = "loaded";
  var PRODUCT = "Indobase Discuss";
  var RE = /\bMattermost\b/gi;
  // Containers whose text must NEVER be rewritten. Renaming chrome is branding; rewriting an
  // upstream copyright line falsifies a legal notice and cuts against the AGPL attribution in
  // NOTICE.md. Hide these with CSS if they must not be shown — do not reword them.
  var SKIP_SEL = ".about-modal__copyright, .about-modal__notice, [data-indobase-no-rebrand]";
  function inSkippedContainer(node) {
    var el = node && node.parentElement;
    while (el) {
      if (el.matches && el.matches(SKIP_SEL)) return true;
      el = el.parentElement;
    }
    return false;
  }

  var SKIP = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEXTAREA:1, CODE:1, PRE:1 };

  function rewriteText(node) {
    if (inSkippedContainer(node)) return;
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

  /*
   * Dismiss the branded cold-load overlay once the app has actually rendered.
   *
   * brand-html replaces Mattermost's #initialPageLoadingScreen with our own node carrying an inline
   * `position:fixed;inset:0;z-index:100;display:flex`. Mattermost only ever dismisses ITS OWN
   * loading node, so nothing hid ours — the app mounted fully underneath and stayed covered by an
   * opaque overlay forever. Discuss was unusable in production with no error and no console output.
   *
   * Two independent triggers, because either alone can miss:
   *   - observer: app root gains real content (the normal path)
   *   - timeout:  hard ceiling, so a render we fail to detect can never strand the user again
   */
  function dismissBrandOverlay() {
    var el = document.getElementById("initialPageLoadingScreen");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    var legacy = document.querySelector("body > .LoadingScreen");
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
  }

  function appHasRendered() {
    var root = document.getElementById("root") || document.getElementById("app");
    return !!root && (root.innerText || "").trim().length > 0;
  }

  function watchForAppRender() {
    if (appHasRendered()) { dismissBrandOverlay(); return; }

    var mo = new MutationObserver(function () {
      if (appHasRendered()) { mo.disconnect(); dismissBrandOverlay(); }
    });
    try {
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (_) {}

    // Safety net: never leave a user staring at a spinner over a working app.
    setTimeout(function () { mo.disconnect(); dismissBrandOverlay(); }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchForAppRender);
  } else {
    watchForAppRender();
  }


  /*
   * Remove infrastructure banners that are operator noise, not user information.
   *
   * Matched by TEXT, deliberately not by class. The banner renders as
   * `.announcement-bar.announcement-bar-success` alongside a hashed emotion class
   * (_StyledDiv-BRlth) — hiding that class would also hide legitimate announcements, and the hash
   * changes on every upstream build. Content matching is narrow and upgrade-stable.
   *
   * EmailSettings.EnablePreviewModeBanner=false is already set in bootstrap; this is defence in
   * depth for volumes whose stored config predates that patch, which is the case in production now.
   */
  var INFRA_BANNER_RE = /Preview Mode|Email notifications have not been configured|has not been configured/i;

  function stripInfraBanners(root) {
    var bars = (root || document).querySelectorAll(".announcement-bar");
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var text = (bar.textContent || "").trim();
      // Bail on anything long — a real announcement should never be removed.
      if (text.length < 200 && INFRA_BANNER_RE.test(text)) {
        bar.style.display = "none";
      }
    }
  }

  function watchInfraBanners() {
    stripInfraBanners(document);
    try {
      new MutationObserver(function () { stripInfraBanners(document); })
        .observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchInfraBanners);
  } else {
    watchInfraBanners();
  }

  /*
   * The document title carried the internal org key:
   *   "roshanholdingz's Project - roshanholdingz-s-org-jmxupwcq Indobase Discuss"
   * Users see that in the tab and in bookmarks. Strip ib-* / *-org-<hash> style tokens.
   */
  function cleanTitle() {
    var t = document.title;
    if (!t) return;
    var cleaned = t
      .replace(/\bib-(?:org|proj|ws-org|ws-proj)-[a-z0-9-]+\b/gi, "")
      .replace(/\b[a-z0-9-]*-org-[a-z0-9]{6,}\b/gi, "")
      .replace(/\s*-\s*(?=\s|$)/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned && cleaned !== t) document.title = cleaned;
  }

  try {
    cleanTitle();
    new MutationObserver(cleanTitle).observe(
      document.querySelector("title") || document.head,
      { childList: true, subtree: true, characterData: true }
    );
  } catch (_) {}

})();
