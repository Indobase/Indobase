/**
 * Extra templates — programmatic colorway / size variants to reach Design-core
 * template volume without hand-authoring hundreds of files.
 */
import { BUILTIN_TEMPLATES, type SeedTemplate } from './templates.js'

type FabricObject = Record<string, unknown>

const COLORWAYS: Array<{ slug: string; name: string; bg: string; accent: string; text: string }> = [
  { slug: 'indigo', name: 'Indigo', bg: '#312E81', accent: '#A5B4FC', text: '#EEF2FF' },
  { slug: 'saffron', name: 'Saffron', bg: '#9A3412', accent: '#FDBA74', text: '#FFF7ED' },
  { slug: 'emerald', name: 'Emerald', bg: '#064E3B', accent: '#6EE7B7', text: '#ECFDF5' },
  { slug: 'rose', name: 'Rose', bg: '#9F1239', accent: '#FDA4AF', text: '#FFF1F2' },
  { slug: 'slate', name: 'Slate', bg: '#0F172A', accent: '#38BDF8', text: '#F8FAFC' },
]

function recolor(objects: FabricObject[], accent: string, text: string): FabricObject[] {
  return objects.map((o) => {
    const next = { ...o }
    if (typeof next.fill === 'string') {
      const f = next.fill.toLowerCase()
      // Recolor non-white / non-black fills toward accent or text.
      if (f !== '#ffffff' && f !== '#fff' && f !== '#000000' && f !== '#000') {
        if (next.type === 'Textbox' || next.type === 'IText' || next.type === 'Text') {
          // keep dark text dark-ish; light text → text color
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

/** Build variants from the hand-authored seed set. */
export function expandTemplateLibrary(): SeedTemplate[] {
  const out: SeedTemplate[] = [...BUILTIN_TEMPLATES]
  let sort = 200

  for (const base of BUILTIN_TEMPLATES) {
    // Skip brand starter — keep one.
    if (base.slug === 'brand-kit-starter') continue

    for (const cw of COLORWAYS) {
      // Don't duplicate near-identical backgrounds for light templates.
      if (base.canvas.background === '#FFFFFF' || base.canvas.background === '#FFFBF2') {
        if (cw.slug !== 'indigo' && cw.slug !== 'saffron') continue
      }

      const objects = recolor(
        (base.canvas.objects as FabricObject[]) || [],
        cw.accent,
        cw.text
      )
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
          objects,
        },
      })
    }
  }

  // Extra blank size starters (docs-lite / custom).
  const blanks: Array<{ slug: string; name: string; category: string; w: number; h: number }> = [
    { slug: 'blank-ig-feed', name: 'Blank — Instagram Feed', category: 'social', w: 1080, h: 1080 },
    { slug: 'blank-ig-story', name: 'Blank — Story / Reel', category: 'story', w: 1080, h: 1920 },
    { slug: 'blank-tiktok', name: 'Blank — TikTok', category: 'story', w: 1080, h: 1920 },
    { slug: 'blank-yt-thumb', name: 'Blank — YouTube Thumb', category: 'social', w: 1280, h: 720 },
    { slug: 'blank-a4', name: 'Blank — A4', category: 'print', w: 1240, h: 1754 },
    { slug: 'blank-letter', name: 'Blank — US Letter', category: 'docs', w: 1275, h: 1650 },
    { slug: 'blank-presentation', name: 'Blank — 16:9 Deck', category: 'presentation', w: 1920, h: 1080 },
    { slug: 'blank-linkedin-cover', name: 'Blank — LinkedIn Cover', category: 'social', w: 1584, h: 396 },
  ]

  for (const b of blanks) {
    out.push({
      slug: b.slug,
      name: b.name,
      category: b.category,
      width: b.w,
      height: b.h,
      sortOrder: sort++,
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
    })
  }

  return out
}
