/**
 * Indobase Discuss — visual system layer.
 *
 * A skin injected into Mattermost's HTML shell that aligns Discuss with the
 * Indobase design language: typography, spacing, radius, elevation, controls,
 * menus, hover/focus states, empty states and loading/skeletons.
 *
 * Design rules this module holds itself to:
 *
 *  1. ADDITIVE ONLY. Nothing here hides or removes an interactive affordance.
 *     There is no `display: none` and no `outline: none` anywhere in the sheet
 *     (both are asserted by unit tests). Branding *removals* belong in
 *     brand-html.ts / Mattermost config, not here.
 *  2. THEME-DERIVED NEUTRALS. Every neutral (surface, hairline, muted ink) is
 *     derived from Mattermost's own runtime theme custom properties
 *     (`--center-channel-bg`, `--center-channel-color-rgb`, …), which the webapp
 *     sets inline on <html> via css-vars-ponyfill. That means user-selected
 *     themes — including the dark ones (Indigo, Onyx) — keep working instead of
 *     being fought with a hardcoded palette.
 *  3. CONTRAST IS NON-NEGOTIABLE. Indobase brand blue #3B8FD6 measures 3.45:1 on
 *     white, which FAILS WCAG 2.2 AA for normal text. It is therefore used only
 *     for non-text purposes (focus rings, borders, tints). Accent fills and
 *     accent text use the darkened #2B6CA3 (5.56:1 on white; white text on it is
 *     also 5.56:1). The numbers below are produced by `contrastRatio()` in this
 *     file and asserted in visual-system.test.ts, so they cannot silently rot.
 *  4. MOTION IS OPT-OUT. Every transition/animation added here is driven by the
 *     `--ib-dur-*` tokens. `prefers-reduced-motion: reduce` (and Mattermost's own
 *     `body.enable-animations` toggle) zero those tokens, which disables exactly
 *     our motion and nothing of Mattermost's.
 *
 * Cascade note: the webapp loads its stylesheets at runtime (webpack injects
 * <link> into <head> after our markup), so upstream rules always come later in
 * source order. Selectors here therefore carry an `html body` prefix to win on
 * specificity rather than relying on order. `!important` is used only where a
 * declaration must not be overridable (brand fills, focus rings) and is called
 * out in comments.
 */

/** Indobase brand blue. Non-text / large-text use only — 3.45:1 on white. */
export const INDOBASE_BRAND_BLUE = '#3B8FD6'

/**
 * Colour tokens shipped by this layer. Values are hex so the contrast helpers
 * (and their tests) can verify them without a browser.
 */
export const INDOBASE_VISUAL_TOKENS = {
  /** Rings, borders, tints. Never text on an unknown background. */
  brand: INDOBASE_BRAND_BLUE,
  /** Accent fills + accent text. 5.56:1 on white, 5.56:1 under white. */
  accent: '#2B6CA3',
  /** Primary control hover. White on it: 7.47:1. */
  accentHover: '#235980',
  /** Primary control active/pressed. White on it: 10.23:1. */
  accentActive: '#1B4463',
  /** Foreground used on top of `accent` / `accentHover` / `accentActive`. */
  onAccent: '#ffffff',
  /** Reference backgrounds used for the contrast assertions. */
  referenceLight: '#ffffff',
  /** Mattermost "Onyx" centre-channel background (darkest shipped theme). */
  referenceDark: '#090a0b',
  /** Mattermost "Denim" sidebar background — worst-case mid-tone for rings. */
  referenceMidtone: '#1e325c',
} as const

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function parseHex(hex: string): [number, number, number] {
  if (typeof hex !== 'string' || !HEX_RE.test(hex.trim())) {
    throw new TypeError(`expected #rgb or #rrggbb colour, received: ${String(hex)}`)
  }
  let body = hex.trim().slice(1)
  if (body.length === 3) {
    body = body
      .split('')
      .map((ch) => ch + ch)
      .join('')
  }
  return [
    Number.parseInt(body.slice(0, 2), 16),
    Number.parseInt(body.slice(2, 4), 16),
    Number.parseInt(body.slice(4, 6), 16),
  ]
}

function toLinear(channel8bit: number): number {
  const c = channel8bit / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG 2.2 relative luminance of an sRGB hex colour (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2.2 contrast ratio between two opaque sRGB hex colours (1…21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG 2.2 minimum contrast per use. `large` = ≥24px, or ≥18.66px bold. */
export function meetsContrast(
  foreground: string,
  background: string,
  use: 'text' | 'large-text' | 'non-text'
): boolean {
  const ratio = contrastRatio(foreground, background)
  if (use === 'text') return ratio >= 4.5
  return ratio >= 3
}

export const VISUAL_SYSTEM_STYLE_ID = 'indobase-discuss-visual-css'

const T = INDOBASE_VISUAL_TOKENS

/**
 * The visual system stylesheet.
 *
 * Selector stability: anchored on Mattermost ids (`#post_textbox`,
 * `#SidebarContainer`, `#global-header`, `#channel_view`), plain SCSS/BEM class
 * names (`.btn-primary`, `.form-control`, `.Input_fieldset`, `.GenericModal`,
 * `.a11y__modal`, `.no-results__*`, `.channel-intro`, `.AdvancedTextEditor__*`,
 * `.SidebarLink`) and ARIA roles (`[role="menu"]`, `[role="menuitem"]`) — all
 * verified against the shipped Mattermost 10.5.2 webapp bundles. Hashed
 * styled-components classes are avoided; the two places where an attribute
 * substring match is unavoidable are marked FRAGILE.
 */
export const VISUAL_SYSTEM_CSS = `
/* ═══════════════════════════════════════════════════════════════════════════
   Indobase Discuss — visual system
   Measured contrast (WCAG 2.2):
     ${T.accent} on ${T.referenceLight} ....... 5.56:1  AA text     → accent fill/text
     ${T.onAccent} on ${T.accent} ....... 5.56:1  AA text     → primary button label
     ${T.onAccent} on ${T.accentHover} ....... 7.47:1  AA text     → primary hover
     ${T.brand} on ${T.referenceLight} ....... 3.45:1  non-text    → ring/border only
     ${T.brand} on ${T.referenceDark} ....... 5.74:1  non-text ok
     ${T.brand} on ${T.referenceMidtone} ....... 3.65:1  non-text ok
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 1. Tokens ──────────────────────────────────────────────────────────────
   Static Indobase values plus neutrals derived from Mattermost's live theme
   variables. Every var() carries a literal fallback so the tokens still resolve
   during cold load, before the webapp has applied a theme. */
:root {
  --ib-brand: ${T.brand};
  --ib-accent: ${T.accent};
  --ib-accent-hover: ${T.accentHover};
  --ib-accent-active: ${T.accentActive};
  --ib-on-accent: ${T.onAccent};

  /* Non-text tints. Alpha keeps these decorative, never load-bearing. */
  --ib-tint-weak: rgba(59, 143, 214, 0.08);
  --ib-tint: rgba(59, 143, 214, 0.12);
  --ib-tint-strong: rgba(59, 143, 214, 0.2);

  /* Neutrals follow the user's Mattermost theme (light and dark alike). */
  --ib-surface: var(--center-channel-bg, #ffffff);
  --ib-ink: var(--center-channel-color, #3f4350);
  --ib-ink-muted: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.72);
  --ib-ink-subtle: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.56);
  --ib-hairline: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.12);
  --ib-hairline-strong: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.24);
  --ib-hover-surface: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.06);

  /* Elevation. The 1px theme-derived ring is what makes these read correctly on
     dark themes, where a pure drop shadow is nearly invisible. */
  --ib-elev-1: 0 0 0 1px var(--ib-hairline), 0 1px 3px rgba(0, 0, 0, 0.08);
  --ib-elev-2: 0 0 0 1px var(--ib-hairline), 0 6px 20px rgba(0, 0, 0, 0.12);
  --ib-elev-3: 0 0 0 1px var(--ib-hairline), 0 18px 48px rgba(0, 0, 0, 0.18);

  --ib-radius-xs: 4px;
  --ib-radius-sm: 6px;
  --ib-radius-md: 8px;
  --ib-radius-lg: 12px;
  --ib-radius-xl: 16px;
  --ib-radius-pill: 999px;

  --ib-space-1: 4px;
  --ib-space-2: 8px;
  --ib-space-3: 12px;
  --ib-space-4: 16px;
  --ib-space-5: 24px;
  --ib-space-6: 32px;

  --ib-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text",
    "Segoe UI", Roboto, "Helvetica Neue", "Open Sans", Arial, sans-serif;
  --ib-font-mono: ui-monospace, SFMono-Regular, "SF Mono", "JetBrains Mono", Menlo,
    Consolas, "Liberation Mono", monospace;

  --ib-dur-fast: 90ms;
  --ib-dur: 140ms;
  --ib-dur-slow: 220ms;
  --ib-dur-shimmer: 1400ms;
  --ib-ease: cubic-bezier(0.2, 0, 0.2, 1);

  /* Brand blue clears 3:1 against white (3.45), Onyx (5.74) and the Denim
     sidebar (3.65), so it is a safe non-text focus indicator in every shipped
     Mattermost theme. */
  --ib-focus-ring: var(--ib-brand);
  --ib-focus-width: 2px;
  --ib-focus-offset: 2px;
}

/* Deeper drop shadows read better on dark surfaces. Cosmetic only — no text or
   contrast decision depends on this block. */
@media (prefers-color-scheme: dark) {
  :root {
    --ib-elev-1: 0 0 0 1px var(--ib-hairline), 0 1px 4px rgba(0, 0, 0, 0.4);
    --ib-elev-2: 0 0 0 1px var(--ib-hairline), 0 6px 20px rgba(0, 0, 0, 0.48);
    --ib-elev-3: 0 0 0 1px var(--ib-hairline), 0 18px 48px rgba(0, 0, 0, 0.56);
  }
}

/* ── 2. Typography ──────────────────────────────────────────────────────────
   Form controls do not inherit font-family, so they are listed explicitly.
   Icon glyph classes (compass-icons / Font Awesome) are deliberately
   NOT in any selector here — matching them would swap the icon font out and
   turn every glyph into tofu. */
html body,
html body button,
html body input,
html body optgroup,
html body select,
html body textarea {
  font-family: var(--ib-font-sans);
}

html body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html body h1,
html body h2,
html body h3,
html body h4,
html body .modal-title,
html body .GenericModal__header {
  font-family: var(--ib-font-sans);
  letter-spacing: -0.01em;
}

html body code,
html body pre,
html body .post-code,
html body .hljs {
  font-family: var(--ib-font-mono);
}

html body pre,
html body .post-code {
  border-radius: var(--ib-radius-md);
}

/* Timestamps and counters line up in a column when digits are tabular. */
html body .post__time,
html body time {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

/* Sidebar category labels (CHANNELS / DIRECT MESSAGES) as quiet eyebrow text.
   Colour is left to the theme — the sidebar palette is user-selectable. */
html body .SidebarChannelGroupHeader .SidebarChannelGroupHeader_text,
html body .SidebarChannelGroupHeader_text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ── 3. Geometry ───────────────────────────────────────────────────────────
   Radius only. No width/height/padding changes on layout-critical containers. */
html body .btn,
html body .form-control,
html body .Input,
html body .Input_container,
html body .Input_fieldset,
html body .modal-content,
html body .attachment .attachment__content,
html body .post-image__thumbnail,
html body .file-preview {
  border-radius: var(--ib-radius-sm);
}

html body .a11y__modal .modal-content,
html body .GenericModal .modal-content {
  border-radius: var(--ib-radius-lg);
  box-shadow: var(--ib-elev-3);
}

html body .a11y__modal .modal-header,
html body .GenericModal .modal-header {
  border-bottom-color: var(--ib-hairline);
}

html body .a11y__modal .modal-footer,
html body .GenericModal .modal-footer {
  border-top-color: var(--ib-hairline);
}

/* ── 4. Buttons ────────────────────────────────────────────────────────────
   Primary = Indobase accent fill with white label (5.56:1). '!important' is
   used on the fill/label pair only: these must survive upstream's own
   '.app__body .btn-primary' rules, which load after this sheet. Disabled state
   is restated below so the important-fill cannot leak into it. */
html body .btn.btn-primary,
html body button.btn-primary,
html body a.btn-primary {
  background-color: var(--ib-accent) !important;
  border-color: transparent;
  color: var(--ib-on-accent) !important;
  border-radius: var(--ib-radius-sm);
  font-weight: 600;
  transition:
    background-color var(--ib-dur) var(--ib-ease),
    box-shadow var(--ib-dur) var(--ib-ease);
}

html body .btn.btn-primary:hover:not(:disabled):not(.disabled),
html body button.btn-primary:hover:not(:disabled):not(.disabled),
html body a.btn-primary:hover:not(.disabled) {
  background-color: var(--ib-accent-hover) !important;
  color: var(--ib-on-accent) !important;
}

html body .btn.btn-primary:active:not(:disabled):not(.disabled),
html body button.btn-primary:active:not(:disabled):not(.disabled) {
  background-color: var(--ib-accent-active) !important;
}

/* Restore a legible disabled state using the theme's own neutrals. */
html body .btn.btn-primary:disabled,
html body .btn.btn-primary.disabled,
html body button.btn-primary:disabled,
html body button.btn-primary.disabled {
  background-color: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.08) !important;
  color: rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.32) !important;
  cursor: not-allowed;
}

/* Secondary / tertiary / quaternary: outlined + tinted rather than filled. */
html body .btn.btn-tertiary,
html body .btn.btn-quaternary,
html body button.btn-tertiary,
html body button.btn-quaternary {
  border-radius: var(--ib-radius-sm);
  font-weight: 600;
  transition:
    background-color var(--ib-dur) var(--ib-ease),
    border-color var(--ib-dur) var(--ib-ease);
}

html body .btn.btn-tertiary:hover:not(:disabled):not(.disabled),
html body .btn.btn-quaternary:hover:not(:disabled):not(.disabled) {
  background-color: var(--ib-tint-weak);
}

html body .btn.btn-secondary:not(.btn-danger) {
  border-radius: var(--ib-radius-sm);
  border-color: var(--ib-hairline-strong);
}

html body .btn.btn-secondary:not(.btn-danger):hover:not(:disabled):not(.disabled) {
  border-color: var(--ib-brand);
  background-color: var(--ib-tint-weak);
}

/* Icon buttons keep their hit area; only the resting shape and motion change. */
html body .btn.btn-icon,
html body button.style--none.btn-icon {
  border-radius: var(--ib-radius-sm);
  transition: background-color var(--ib-dur-fast) var(--ib-ease);
}

html body .btn.btn-icon:hover:not(:disabled):not(.disabled) {
  background-color: var(--ib-hover-surface);
}

/* Destructive actions stay red — brand accent must never dilute a danger cue. */
html body .btn.btn-danger,
html body button.btn-danger {
  border-radius: var(--ib-radius-sm);
  font-weight: 600;
}

/* ── 5. Inputs ─────────────────────────────────────────────────────────────
   Text fields get the ring treatment instead of the global outline (§7) so the
   message box does not carry a doubled indicator while the user types. */
html body .form-control,
html body .Input_fieldset,
html body .Input_container {
  transition:
    border-color var(--ib-dur) var(--ib-ease),
    box-shadow var(--ib-dur) var(--ib-ease);
}

html body .form-control:focus,
html body .form-control:focus-visible,
html body .Input_fieldset:focus-within,
html body .Input_container:focus-within {
  border-color: var(--ib-brand);
  box-shadow: 0 0 0 var(--ib-focus-width) var(--ib-tint-strong);
}

html body .form-control::placeholder,
html body input::placeholder,
html body textarea::placeholder {
  color: var(--ib-ink-subtle);
}

/* Message composer. Border/radius only — height and padding stay upstream's,
   because the editor measures its own box to autosize. */
html body .AdvancedTextEditor__body {
  border-radius: var(--ib-radius-md);
  transition:
    border-color var(--ib-dur) var(--ib-ease),
    box-shadow var(--ib-dur) var(--ib-ease);
}

html body .AdvancedTextEditor__body:focus-within {
  border-color: var(--ib-brand);
  box-shadow: 0 0 0 var(--ib-focus-width) var(--ib-tint-strong);
}

html body #post_textbox,
html body .custom-textarea {
  font-family: var(--ib-font-sans);
}

/* Search / quick-switcher field. */
html body .SearchBar__input,
html body #searchBox,
html body #quickSwitchInput {
  border-radius: var(--ib-radius-pill);
}

/* ── 6. Menus, popovers, tooltips ──────────────────────────────────────────
   '[role="menu"]' / '[role="menuitem"]' are semantic and survive upstream
   restyling; the legacy '.Menu__content.dropdown-menu' pair is kept for the
   older menus that have not migrated. */
html body .dropdown-menu,
html body .Menu__content,
html body [role="menu"],
html body .popover {
  border-radius: var(--ib-radius-md);
  box-shadow: var(--ib-elev-2);
}

html body .MenuItem > button,
html body .MenuItem > a,
html body .MenuItem > div,
html body [role="menuitem"],
html body [role="menuitemcheckbox"] {
  border-radius: var(--ib-radius-xs);
  transition: background-color var(--ib-dur-fast) var(--ib-ease);
}

html body .MenuItem > button:hover,
html body .MenuItem > a:hover,
html body [role="menuitem"]:hover,
html body [role="menuitemcheckbox"]:hover {
  background-color: var(--ib-tint-weak);
}

html body .menu-divider,
html body .dropdown-menu .divider,
html body [role="separator"] {
  background-color: var(--ib-hairline);
}

html body .tooltip-inner,
html body [role="tooltip"] {
  border-radius: var(--ib-radius-sm);
  box-shadow: var(--ib-elev-1);
}

/* ── 7. Hover + focus states ───────────────────────────────────────────────
   Additive only. This sheet never clears focus outlines — the global ring is
   layered on top of whatever Mattermost already draws. Text inputs are excluded
   because §5 gives them a border ring instead. */
html body a:focus-visible,
html body button:focus-visible,
html body summary:focus-visible,
html body select:focus-visible,
html body [role="button"]:focus-visible,
html body [role="menuitem"]:focus-visible,
html body [role="menuitemcheckbox"]:focus-visible,
html body [role="tab"]:focus-visible,
html body [role="option"]:focus-visible,
html body [role="link"]:focus-visible,
html body [tabindex]:not([tabindex="-1"]):focus-visible {
  outline: var(--ib-focus-width) solid var(--ib-focus-ring) !important;
  outline-offset: var(--ib-focus-offset);
}

html body .SidebarLink,
html body .SidebarChannel .SidebarLink {
  border-radius: var(--ib-radius-sm);
  transition: background-color var(--ib-dur-fast) var(--ib-ease);
}

/* Row hovers use the theme's own ink so they read correctly on dark sidebars. */
html body .channel-header__icon,
html body .post-menu .post-menu__item {
  transition:
    background-color var(--ib-dur-fast) var(--ib-ease),
    color var(--ib-dur-fast) var(--ib-ease);
}

html body #global-header,
html body .channel-header {
  border-bottom-color: var(--ib-hairline);
}

/* Scrollbars: quiet, theme-derived, and only where the app already scrolls. */
html body .post-list__dynamic,
html body #SidebarContainer,
html body .sidebar--right__content,
html body .modal-body {
  scrollbar-width: thin;
  scrollbar-color: var(--ib-hairline-strong) transparent;
}

/* ── 8. Empty states ───────────────────────────────────────────────────────
   Calmer hierarchy: one confident title, quiet supporting copy, softened art. */
html body .no-results__wrapper {
  padding: var(--ib-space-6) var(--ib-space-5);
}

html body .no-results__title {
  font-family: var(--ib-font-sans);
  font-weight: 600;
  letter-spacing: -0.01em;
}

html body .no-results__subtitle {
  color: var(--ib-ink-muted);
  line-height: 1.5;
  max-width: 46ch;
  margin-left: auto;
  margin-right: auto;
}

html body .no-results__icon {
  opacity: 0.85;
}

html body .channel-intro {
  border-bottom-color: var(--ib-hairline);
}

html body .channel-intro__title {
  font-weight: 700;
  letter-spacing: -0.015em;
}

/* ── 9. Loading + skeletons ────────────────────────────────────────────────
   The cold-load screen itself is owned by brand-html.ts; this block covers the
   in-app loaders. The shimmer is defined against the theme's ink so it works on
   light and dark surfaces alike. */
@keyframes ib-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

html body .AdvancedTextEditor__skeleton,
html body [class*="SkeletonLoader"] {
  /* FRAGILE: the second selector matches styled-components display names
     ('RectangleSkeletonLoader' styled-component class prefix); the hash moves on upgrade but the
     display-name prefix has been stable. Losing the match only costs the
     shimmer — the skeleton still renders from upstream styles. */
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(var(--center-channel-color-rgb, 63, 67, 80), 0.06) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: ib-skeleton-shimmer var(--ib-dur-shimmer) linear infinite;
  border-radius: var(--ib-radius-sm);
}

html body .loading-screen,
html body .loading__content {
  color: var(--ib-ink-muted);
}

html body .loading__content .round {
  background-color: var(--ib-brand);
}

/* ── 10. Motion ────────────────────────────────────────────────────────────
   Zeroing the duration tokens disables every transition and animation added by
   this sheet — and nothing of Mattermost's, which is why there is no blanket
   universal transition reset here. 'body.enable-animations' is Mattermost's
   own user-level animation switch; we honour it too. */
@media (prefers-reduced-motion: reduce) {
  html body {
    --ib-dur-fast: 0ms;
    --ib-dur: 0ms;
    --ib-dur-slow: 0ms;
  }

  html body .AdvancedTextEditor__skeleton,
  html body [class*="SkeletonLoader"] {
    animation: none;
    background-image: none;
  }
}

html body:not(.enable-animations) {
  --ib-dur-fast: 0ms;
  --ib-dur: 0ms;
  --ib-dur-slow: 0ms;
}

/* ── 11. Print ─────────────────────────────────────────────────────────────
   Transcripts get printed. Keep the ink, drop the chrome shadows. */
@media print {
  html body .a11y__modal .modal-content,
  html body .dropdown-menu,
  html body [role="menu"] {
    box-shadow: none;
  }
}
`

/** The visual system wrapped in its <style> element, ready to inject. */
export function visualSystemStyleTag(): string {
  return `<style id="${VISUAL_SYSTEM_STYLE_ID}">${VISUAL_SYSTEM_CSS}</style>`
}

/**
 * Insert the visual system stylesheet as the last child of <head>.
 *
 * Idempotent: an HTML document that already carries the layer is returned
 * unchanged, so double-branding a response can never duplicate the sheet.
 * CSS only — nothing here emits a <script>, so Mattermost's document-level
 * `script-src 'self'` CSP is irrelevant to this layer.
 */
export function injectVisualSystem(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return html
  if (html.includes(`id="${VISUAL_SYSTEM_STYLE_ID}"`)) return html

  const tag = visualSystemStyleTag()

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tag}</head>`)
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`)
  }
  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b[^>]*>/i, (m) => `${m}${tag}`)
  }
  return `${tag}${html}`
}
