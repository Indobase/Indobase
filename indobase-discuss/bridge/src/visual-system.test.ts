import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  INDOBASE_BRAND_BLUE,
  INDOBASE_VISUAL_TOKENS as T,
  VISUAL_SYSTEM_CSS,
  VISUAL_SYSTEM_STYLE_ID,
  contrastRatio,
  injectVisualSystem,
  meetsContrast,
  relativeLuminance,
  visualSystemStyleTag,
} from './visual-system.js'

const SHELL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Indobase Discuss</title></head><body class="font--open_sans enable-animations"><div id="root"></div></body></html>`

describe('relativeLuminance', () => {
  it('anchors on the sRGB extremes', () => {
    assert.equal(relativeLuminance('#000000'), 0)
    assert.equal(relativeLuminance('#ffffff'), 1)
  })

  it('accepts shorthand hex', () => {
    assert.equal(relativeLuminance('#fff'), relativeLuminance('#ffffff'))
    assert.equal(relativeLuminance('#000'), relativeLuminance('#000000'))
  })

  it('rejects anything that is not a hex colour', () => {
    assert.throws(() => relativeLuminance('rgb(0,0,0)'), TypeError)
    assert.throws(() => relativeLuminance('#12345'), TypeError)
    assert.throws(() => relativeLuminance(''), TypeError)
  })
})

describe('contrastRatio', () => {
  it('returns 21 for black on white and 1 for a colour on itself', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21)
    assert.equal(contrastRatio('#3B8FD6', '#3B8FD6'), 1)
  })

  it('is order independent', () => {
    assert.equal(contrastRatio('#2B6CA3', '#ffffff'), contrastRatio('#ffffff', '#2B6CA3'))
  })
})

describe('Indobase palette accessibility (WCAG 2.2 AA)', () => {
  it('brand blue fails normal-text contrast on white — which is why it is non-text only', () => {
    // Documents the constraint that shapes the whole layer. If this ever passes,
    // the brand blue changed and the accent split below can be revisited.
    assert.ok(contrastRatio(INDOBASE_BRAND_BLUE, '#ffffff') < 4.5)
    assert.equal(meetsContrast(INDOBASE_BRAND_BLUE, '#ffffff', 'text'), false)
  })

  it('brand blue is a valid non-text focus ring on every shipped Mattermost theme', () => {
    for (const bg of [T.referenceLight, T.referenceDark, T.referenceMidtone]) {
      assert.ok(
        meetsContrast(T.brand, bg, 'non-text'),
        `focus ring ${T.brand} on ${bg} = ${contrastRatio(T.brand, bg).toFixed(2)}:1, needs >= 3`
      )
    }
  })

  it('accent passes AA as text on a light surface', () => {
    assert.ok(
      meetsContrast(T.accent, T.referenceLight, 'text'),
      `${T.accent} on white = ${contrastRatio(T.accent, T.referenceLight).toFixed(2)}:1`
    )
  })

  it('primary button label passes AA in every resting state', () => {
    for (const fill of [T.accent, T.accentHover, T.accentActive]) {
      assert.ok(
        meetsContrast(T.onAccent, fill, 'text'),
        `${T.onAccent} on ${fill} = ${contrastRatio(T.onAccent, fill).toFixed(2)}:1, needs >= 4.5`
      )
    }
  })

  it('primary button fill stays distinguishable from light and dark page surfaces', () => {
    for (const bg of [T.referenceLight, T.referenceDark]) {
      assert.ok(
        meetsContrast(T.accent, bg, 'non-text'),
        `button fill ${T.accent} on ${bg} = ${contrastRatio(T.accent, bg).toFixed(2)}:1`
      )
    }
  })

  it('hover and active fills get progressively darker', () => {
    assert.ok(relativeLuminance(T.accentHover) < relativeLuminance(T.accent))
    assert.ok(relativeLuminance(T.accentActive) < relativeLuminance(T.accentHover))
  })
})

describe('VISUAL_SYSTEM_CSS safety rails', () => {
  it('never hides anything — this layer is additive skin only', () => {
    assert.equal(/display\s*:\s*none/i.test(VISUAL_SYSTEM_CSS), false)
    assert.equal(/visibility\s*:\s*hidden/i.test(VISUAL_SYSTEM_CSS), false)
  })

  it('never removes a focus ring', () => {
    assert.equal(/outline\s*:\s*(none|0)\b/i.test(VISUAL_SYSTEM_CSS), false)
    assert.equal(/outline-(?:width|style)\s*:\s*(none|0)\b/i.test(VISUAL_SYSTEM_CSS), false)
  })

  it('ships a focus-visible ring driven by the brand token', () => {
    assert.match(VISUAL_SYSTEM_CSS, /:focus-visible/)
    assert.match(VISUAL_SYSTEM_CSS, /--ib-focus-ring:\s*var\(--ib-brand\)/)
  })

  it('honours prefers-reduced-motion by zeroing its own duration tokens', () => {
    assert.match(VISUAL_SYSTEM_CSS, /@media \(prefers-reduced-motion: reduce\)/)
    const block =
      VISUAL_SYSTEM_CSS.split('@media (prefers-reduced-motion: reduce)')[1]?.slice(0, 400) ?? ''
    assert.match(block, /--ib-dur:\s*0ms/)
    assert.match(block, /--ib-dur-fast:\s*0ms/)
    assert.match(block, /--ib-dur-slow:\s*0ms/)
  })

  it('does not carry a blanket motion reset that would break upstream animations', () => {
    // A `* { transition: none }` reset would also kill the animationend event the
    // Mattermost loading screen relies on to tear itself down.
    assert.equal(/\*\s*,?\s*::?before/i.test(VISUAL_SYSTEM_CSS), false)
    assert.equal(/^\s*\*\s*\{/m.test(VISUAL_SYSTEM_CSS), false)
  })

  it('derives neutrals from Mattermost theme variables so dark themes survive', () => {
    assert.match(VISUAL_SYSTEM_CSS, /var\(--center-channel-bg,/)
    assert.match(VISUAL_SYSTEM_CSS, /var\(--center-channel-color-rgb, 63, 67, 80\)/)
  })

  it('every animation/transition it adds is expressed in --ib-dur tokens', () => {
    const durations = VISUAL_SYSTEM_CSS.match(/transition:[^;]+;/g) ?? []
    assert.ok(durations.length > 0)
    for (const decl of durations) {
      assert.match(decl, /--ib-dur/, `transition without an --ib-dur token: ${decl}`)
    }
  })

  it('leaves icon fonts alone', () => {
    // Matching .icon / .fa would swap compass-icons out and render tofu.
    assert.equal(/\.icon\b[^{]*\{[^}]*font-family/i.test(VISUAL_SYSTEM_CSS), false)
    assert.equal(/\.fa\b/.test(VISUAL_SYSTEM_CSS), false)
  })

  it('keeps destructive actions off the brand palette', () => {
    const danger = VISUAL_SYSTEM_CSS.match(/\.btn-danger[\s\S]{0,300}?\}/)?.[0] ?? ''
    assert.ok(danger.length > 0)
    assert.equal(/--ib-accent|--ib-brand/.test(danger), false)
  })
})

describe('visualSystemStyleTag', () => {
  it('emits a single identified style element and no script', () => {
    const tag = visualSystemStyleTag()
    assert.match(tag, new RegExp(`^<style id="${VISUAL_SYSTEM_STYLE_ID}">`))
    assert.match(tag, /<\/style>$/)
    assert.equal(/<script/i.test(tag), false)
    assert.equal(tag.split('<style').length - 1, 1)
  })

  it('contains no closing style tag inside the CSS body', () => {
    assert.equal(VISUAL_SYSTEM_CSS.includes('</style>'), false)
    assert.equal(VISUAL_SYSTEM_CSS.includes('<'), false)
  })
})

describe('injectVisualSystem', () => {
  it('appends the layer as the last child of head', () => {
    const out = injectVisualSystem(SHELL)
    assert.match(out, new RegExp(`<style id="${VISUAL_SYSTEM_STYLE_ID}">[\\s\\S]*</style></head>`))
  })

  it('is idempotent', () => {
    const once = injectVisualSystem(SHELL)
    assert.equal(injectVisualSystem(once), once)
    assert.equal(once.split(VISUAL_SYSTEM_STYLE_ID).length - 1, 1)
  })

  it('falls back to an open <head> when the document has no </head>', () => {
    const out = injectVisualSystem('<html><head><title>x</title><body>hi</body></html>')
    assert.match(out, new RegExp(`<head><style id="${VISUAL_SYSTEM_STYLE_ID}">`))
  })

  it('falls back to <body> when there is no head at all', () => {
    const out = injectVisualSystem('<html><body>hi</body></html>')
    assert.match(out, new RegExp(`<body><style id="${VISUAL_SYSTEM_STYLE_ID}">`))
  })

  it('prepends when the fragment has neither head nor body', () => {
    const out = injectVisualSystem('<div>hi</div>')
    assert.match(out, new RegExp(`^<style id="${VISUAL_SYSTEM_STYLE_ID}">`))
    assert.match(out, /<div>hi<\/div>$/)
  })

  it('leaves empty input untouched', () => {
    assert.equal(injectVisualSystem(''), '')
  })

  it('does not disturb the rest of the document', () => {
    const out = injectVisualSystem(SHELL)
    assert.match(out, /<div id="root"><\/div>/)
    assert.match(out, /<title>Indobase Discuss<\/title>/)
    assert.match(out, /class="font--open_sans enable-animations"/)
  })
})
