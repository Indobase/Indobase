/**
 * Extra templates — programmatic colorway / size variants + large catalog
 * to reach Design-core template volume without hand-authoring thousands of files.
 */
import { BUILTIN_TEMPLATES, type SeedTemplate } from './templates.js'
import { DECK_TEMPLATES } from './templates-deck.js'
import { generateCatalogTemplates } from './templates-catalog.js'

type FabricObject = Record<string, unknown>

const COLORWAYS: Array<{ slug: string; name: string; bg: string; accent: string; text: string }> = [
  { slug: 'indigo', name: 'Indigo', bg: '#312E81', accent: '#A5B4FC', text: '#EEF2FF' },
  { slug: 'saffron', name: 'Saffron', bg: '#9A3412', accent: '#FDBA74', text: '#FFF7ED' },
  { slug: 'emerald', name: 'Emerald', bg: '#064E3B', accent: '#6EE7B7', text: '#ECFDF5' },
  { slug: 'rose', name: 'Rose', bg: '#9F1239', accent: '#FDA4AF', text: '#FFF1F2' },
  { slug: 'slate', name: 'Slate', bg: '#0F172A', accent: '#38BDF8', text: '#F8FAFC' },
  { slug: 'gold', name: 'Gold', bg: '#1C1917', accent: '#FBBF24', text: '#FAFAF9' },
  { slug: 'ocean', name: 'Ocean', bg: '#0C4A6E', accent: '#7DD3FC', text: '#F0F9FF' },
]

function recolor(objects: FabricObject[], accent: string, text: string): FabricObject[] {
  return objects.map((o) => {
    const next = { ...o }
    if (typeof next.fill === 'string') {
      const f = next.fill.toLowerCase()
      if (f !== '#ffffff' && f !== '#fff' && f !== '#000000' && f !== '#000') {
        if (next.type === 'Textbox' || next.type === 'IText' || next.type === 'Text') {
          const isLight = f === '#ffffff' || f.startsWith('#f') || f.startsWith('#e')
          if (isLight) next.fill = text
        } else {
          next.fill = accent
        }
      }
    }
    return next
  })
}

function expandColorways(bases: SeedTemplate[], startSort: number): SeedTemplate[] {
  const out: SeedTemplate[] = []
  let sort = startSort
  for (const base of bases) {
    if (base.slug === 'brand-kit-starter') continue
    for (const cw of COLORWAYS) {
      if (base.canvas.background === '#FFFFFF' || base.canvas.background === '#FFFBF2') {
        if (cw.slug !== 'indigo' && cw.slug !== 'saffron' && cw.slug !== 'ocean') continue
      }
      out.push({
        slug: `${base.slug}-${cw.slug}`,
        name: `${base.name} · ${cw.name}`,
        category: base.category,
        width: base.width,
        height: base.height,
        sortOrder: sort++,
        canvas: {
          version: '6.0.0',
          background: cw.bg,
          objects: recolor((base.canvas.objects as FabricObject[]) || [], cw.accent, cw.text),
        },
      })
    }
  }
  return out
}

function blankStarters(startSort: number): SeedTemplate[] {
  const blanks: Array<{ slug: string; name: string; category: string; w: number; h: number }> = [
    { slug: 'blank-ig-feed', name: 'Blank — Instagram Feed', category: 'social', w: 1080, h: 1080 },
    { slug: 'blank-ig-story', name: 'Blank — Story / Reel', category: 'story', w: 1080, h: 1920 },
    { slug: 'blank-tiktok', name: 'Blank — TikTok', category: 'story', w: 1080, h: 1920 },
    { slug: 'blank-yt-thumb', name: 'Blank — YouTube Thumb', category: 'youtube', w: 1280, h: 720 },
    { slug: 'blank-a4', name: 'Blank — A4', category: 'print', w: 1240, h: 1754 },
    { slug: 'blank-letter', name: 'Blank — US Letter', category: 'docs', w: 1275, h: 1650 },
    { slug: 'blank-presentation', name: 'Blank — 16:9 Deck', category: 'presentation', w: 1920, h: 1080 },
    { slug: 'blank-linkedin-cover', name: 'Blank — LinkedIn Cover', category: 'linkedin', w: 1584, h: 396 },
    { slug: 'blank-business-card', name: 'Blank — Business Card', category: 'business-card', w: 1050, h: 600 },
    { slug: 'blank-logo', name: 'Blank — Logo Square', category: 'logo', w: 1080, h: 1080 },
    { slug: 'blank-poster', name: 'Blank — Poster', category: 'poster', w: 1080, h: 1350 },
    { slug: 'blank-fb-ad', name: 'Blank — Facebook Ad', category: 'ads', w: 1200, h: 628 },
  ]

  return blanks.map((b, i) => ({
    slug: b.slug,
    name: b.name,
    category: b.category,
    width: b.w,
    height: b.h,
    sortOrder: startSort + i,
    canvas: {
      version: '6.0.0',
      background: '#FFFFFF',
      objects: [
        {
          type: 'Textbox',
          version: '6.0.0',
          text: 'Start designing',
          left: 60,
          top: 60,
          width: Math.min(600, b.w - 120),
          fontSize: 36,
          fill: '#94A3B8',
          fontFamily: 'Inter',
          originX: 'left',
          originY: 'top',
          strokeWidth: 0,
        },
      ],
    },
  }))
}

/** Full seed library: hand-authored + decks + colorways + procedural catalog. */
export function expandTemplateLibrary(): SeedTemplate[] {
  const hand = [...BUILTIN_TEMPLATES, ...DECK_TEMPLATES]
  const colorways = expandColorways(hand, 200)
  const blanks = blankStarters(800)
  const catalog = generateCatalogTemplates(1000)

  const bySlug = new Map<string, SeedTemplate>()
  for (const t of [...hand, ...colorways, ...blanks, ...catalog]) {
    if (!bySlug.has(t.slug)) bySlug.set(t.slug, t)
  }
  return Array.from(bySlug.values()).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function libraryCountsByCategory(): Record<string, number> {
  const by: Record<string, number> = {}
  for (const t of expandTemplateLibrary()) {
    by[t.category] = (by[t.category] || 0) + 1
  }
  return by
}
