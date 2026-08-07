import type { DesignScheme } from '~/types/design-scheme';

/**
 * Shared design guidance for Builder codegen.
 * Explicitly bans the purple/glow "AI template" look and forces industry-specific art direction.
 */
export function getDesignInstructions(designScheme?: DesignScheme): string {
  const schemeBlock = designScheme
    ? `
  User Design Scheme (MUST follow unless the user overrides):
  FONT: ${JSON.stringify(designScheme.font)}
  PALETTE: ${JSON.stringify(designScheme.palette)}
  FEATURES: ${JSON.stringify(designScheme.features)}`
    : `
  No user scheme provided. Invent a bespoke light-first palette for THIS product's industry
  (3–5 colors + neutrals). Default toward Indobase brand blue (~#3B8FD6) or a warm/neutral
  accent that fits the business — never purple/violet/indigo as primary.`;

  return `<design_instructions>
  CRITICAL — visual quality bar:
  - Ship production-ready UI with real content, working interactions, and clear hierarchy.
  - Every product must feel custom to its industry and brand — not a reused SaaS template.
  - First viewport = one composition: brand/product name, one headline, one short support line,
    one CTA group, and one dominant visual (photo, product UI, or atmosphere). No card grids in the hero.
  - Prefer light backgrounds unless the user asks for dark mode.

  HARD BANS (AI-template smell — never ship these unless the user explicitly asks):
  - Purple, violet, indigo, or lilac as primary/accent (including #7C3AED, #8B5CF6, #9E7FFF, #6366F1)
  - Purple-to-indigo / purple-to-pink gradients, neon glows, glassmorphism stacks, multi-layer colored shadows
  - Default stacks: Inter, Roboto, Arial, or system-ui as the only typeface
  - Warm cream (#F4F1EA-ish) + terracotta serif "brochure" cliché
  - Cookie layouts: hero + 3 identical feature cards + logo cloud + pricing + footer every time
  - Pill badge clusters, floating promo stickers, emoji-as-icon rows, fake "Trusted by" logos
  - Unsplash or invented Pexels photo IDs — NEVER guess stock CDN URLs
  - Static brochure pages with no hover/focus/loading/empty/error states

  Real photography (REQUIRED when a photo is needed):
  - Do NOT invent https://images.unsplash.com/... or https://images.pexels.com/... links
  - Use Indobase stock markers; finalizeCodegen resolves them to real Openverse CC images:
      <img data-indobase-stock="warm coffee shop interior, daylight" alt="Cafe interior" src="" />
      background-image: url("indobase-stock:modern dental clinic reception");
      src={"indobase-stock:handmade ceramic bowls on wood table"}
  - Write a specific, visual search phrase (subject + setting + mood). One marker per image.
  - If a photo is not needed, prefer CSS/SVG atmosphere — never a fake stock URL
  - Icons: use lucide-react (or similar), not random PNGs

  Art direction (pick ONE style that fits the brief and commit):
  - editorial / photographic / Swiss grid / industrial / hospitality-warm / clinical-calm /
    fintech-precise / consumer-playful (non-purple) / dashboard-utilitarian
  - Derive palette from the business: food → warm earth tones; clinic → calm blues/greens;
    finance → deep navy + crisp white; local shop → material colors from the craft — not a fixed theme
  - Typography: expressive, purposeful pairing (e.g. newsreader + geometric sans, or display +
    humanistic sans). Never Inter-only. Body ≥16px, clear type scale, real hierarchy
  - Color: define CSS variables (--color-primary, --color-surface, …). One accent for CTAs.
    Atmosphere via subtle gradients, patterns, or photography — not purple glow blobs
  - Motion: 2–3 intentional motions (e.g. scroll reveal, button press, page transition) — not noise

  Layout & interaction:
  - One job per section: one purpose, one headline, usually one short support sentence
  - Cards only when they wrap a real interaction; otherwise prefer open layout
  - Wire real UI states: loading, empty, error, success, disabled, focus
  - Forms validate; buttons show pending; lists handle empty data
  - Responsive: mobile-first, usable touch targets, no horizontal overflow
  - WCAG 2.1 AA contrast; respect prefers-reduced-motion
  - 8px spacing grid; consistent radius (prefer 8–12px over rounded-full pills)

  Mobile (Expo / React Native) extras when building apps:
  - Follow platform patterns (tabs, stacks, sheets) — do not clone a marketing landing into an app
  - StyleSheet.create; native feel; same purple/template bans as web
${schemeBlock}

  Final check before finishing:
  - Would this still look on-brand if you removed the nav? If not, strengthen brand in the first viewport.
  - Is primary anything purple/indigo? If yes, change it.
  - Could this be mistaken for a free Tailwind landing template? If yes, redesign layout and type.
  - Are interactions and content real enough for a customer demo? If not, finish them.
</design_instructions>`;
}
