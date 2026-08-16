/**
 * Merchant-admin overlay for the proxied CFOS desktop.
 * Light Polariz-style home (sidebar + search bar + setup cards).
 * Tokens only — no vendor naming in the operator UI.
 */
export const MERCHANT_OS_CSS = `
html, html.dark, html[data-theme="dark"], :root {
  color-scheme: light !important;
  --color-kumo-tint: #f1f2f4 !important;
  --color-kumo-fill: #ffffff !important;
  --color-kumo-control: #ffffff !important;
  --color-kumo-line: #e3e4e5 !important;
  --color-kumo-subtle: #8c9196 !important;
  --text-color-kumo-default: #303030 !important;
  --text-color-kumo-strong: #1a1a1a !important;
  --text-color-kumo-subtle: #616161 !important;
  --text-color-kumo-inactive: #8c9196 !important;
  --color-kumo-brand: #3B8FD6 !important;
  --color-kumo-brand-hover: #2f7cc0 !important;
  --text-color-kumo-brand: #3B8FD6 !important;
  --text-color-kumo-link: #2f7cc0 !important;
  --color-accent-100: #3B8FD6 !important;
  background: #f1f2f4 !important;
}
html, body, #root, #app {
  background: #f1f2f4 !important;
  color: #1a1a1a !important;
}
body { min-height: 100%; }
header, [data-slot="header"], nav[aria-label="Main"] {
  background: #1a1c1d !important;
  color: #f1f2f4 !important;
  border-color: #1a1c1d !important;
}
header input, header [role="search"], header [type="search"] {
  background: #303030 !important;
  color: #f1f2f4 !important;
  border: 0 !important;
  border-radius: 999px !important;
}
header a, header button, header svg { color: inherit !important; }
aside:not([aria-label="Business workspace"]), [data-slot="sidebar"], nav[aria-label="Sidebar"], nav[aria-label="Workspace"] {
  background: #ebebeb !important;
  color: #1a1a1a !important;
  border-right: 1px solid #e3e4e5 !important;
}
aside [data-active="true"], aside [aria-current="page"] {
  background: #fff !important;
  border-radius: 10px !important;
  box-shadow: 0 0 0 1px #e3e4e5 inset;
}
main {
  background: #f8f8f8 !important;
}
form:has(textarea), form:has([contenteditable="true"]) {
  background: transparent !important;
}
main textarea, main [contenteditable="true"], main input[placeholder*="Ask"],
main input[placeholder*="Write"], main input[placeholder*="Describe"] {
  border-radius: 999px !important;
  background: #fff !important;
  border: 1px solid #e3e4e5 !important;
  box-shadow: 0 1px 0 rgba(26,28,29,.04), 0 1px 8px rgba(26,28,29,.06) !important;
}
/* Hide native engine rail — merchant nav is ours */
html.indobase-merchant-os [data-slot="sidebar"],
html.indobase-merchant-os nav[aria-label="Sidebar"],
html.indobase-merchant-os nav[aria-label="Workspace"] {
  display: none !important;
}
html[data-ib-surface="home"] .ib-merchant {
  min-height: calc(100vh - 56px) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
/* Chat is the right Ask panel (~400px), not the whole page */
@media (min-width: 960px) {
  html[data-ib-surface="chat"] body > #root,
  html[data-ib-surface="chat"] body > #app {
    position: fixed !important;
    top: 56px !important;
    right: 0 !important;
    bottom: 0 !important;
    left: auto !important;
    width: 400px !important;
    max-width: min(400px, 100vw) !important;
    height: 100% !important;
    z-index: 48 !important;
    background: #fff !important;
    border-left: 1px solid #e3e4e5 !important;
    overflow: hidden !important;
  }
  html[data-ib-surface="chat"] [class*="GadgetEditor"],
  html[data-ib-surface="chat"] iframe[title="Application preview"] {
    display: none !important;
  }
}
`.replace(/\s+/g, ' ').trim()
