/**
 * Procedural template catalog — Canva-scale volume with distinct layouts per
 * category (not clone-of-one JSON). Used at seed time via expandTemplateLibrary().
 */
import type { SeedTemplate } from './templates.js'

type FabricObject = Record<string, unknown>

type Palette = {
  slug: string
  name: string
  bg: string
  accent: string
  text: string
  muted: string
  surface: string
}

type Theme = {
  slug: string
  name: string
  eyebrow: string
  headline: string
  sub: string
  cta: string
}

type LayoutId =
  | 'hero'
  | 'split-left'
  | 'split-right'
  | 'banner-top'
  | 'banner-bottom'
  | 'diagonal'
  | 'circles'
  | 'framed'
  | 'minimal'
  | 'metrics'
  | 'quote'
  | 'photo-slot'
  | 'corner'
  | 'stack'
  | 'bold-type'
  | 'grid-2'
  | 'ribbon'
  | 'timeline'
  | 'spotlight'
  | 'asymmetric'
  | 'footer-bar'

const FONT_DISPLAY = 'Montserrat'
const FONT_BODY = 'Inter'
const FONT_SERIF = 'Playfair Display'

const PALETTES: Palette[] = [
  { slug: 'indigo', name: 'Indigo', bg: '#312E81', accent: '#A5B4FC', text: '#EEF2FF', muted: '#C7D2FE', surface: '#1E1B4B' },
  { slug: 'saffron', name: 'Saffron', bg: '#9A3412', accent: '#FDBA74', text: '#FFF7ED', muted: '#FED7AA', surface: '#7C2D12' },
  { slug: 'emerald', name: 'Emerald', bg: '#064E3B', accent: '#6EE7B7', text: '#ECFDF5', muted: '#A7F3D0', surface: '#022C22' },
  { slug: 'rose', name: 'Rose', bg: '#9F1239', accent: '#FDA4AF', text: '#FFF1F2', muted: '#FECDD3', surface: '#881337' },
  { slug: 'slate', name: 'Slate', bg: '#0F172A', accent: '#38BDF8', text: '#F8FAFC', muted: '#94A3B8', surface: '#1E293B' },
  { slug: 'gold', name: 'Gold', bg: '#1C1917', accent: '#FBBF24', text: '#FAFAF9', muted: '#D6D3D1', surface: '#292524' },
  { slug: 'ocean', name: 'Ocean', bg: '#0C4A6E', accent: '#7DD3FC', text: '#F0F9FF', muted: '#BAE6FD', surface: '#075985' },
  { slug: 'violet', name: 'Violet', bg: '#4C1D95', accent: '#C4B5FD', text: '#F5F3FF', muted: '#DDD6FE', surface: '#5B21B6' },
  { slug: 'forest', name: 'Forest', bg: '#14532D', accent: '#86EFAC', text: '#F0FDF4', muted: '#BBF7D0', surface: '#166534' },
  { slug: 'coral', name: 'Coral', bg: '#7F1D1D', accent: '#FCA5A5', text: '#FEF2F2', muted: '#FECACA', surface: '#991B1B' },
  { slug: 'cream', name: 'Cream', bg: '#FFFBF2', accent: '#C2925A', text: '#1F2937', muted: '#6B7280', surface: '#FFFFFF' },
  { slug: 'paper', name: 'Paper', bg: '#F8FAFC', accent: '#3B8FD6', text: '#0F172A', muted: '#64748B', surface: '#FFFFFF' },
  { slug: 'midnight', name: 'Midnight', bg: '#020617', accent: '#818CF8', text: '#F1F5F9', muted: '#94A3B8', surface: '#0F172A' },
  { slug: 'mint', name: 'Mint', bg: '#ECFDF5', accent: '#059669', text: '#064E3B', muted: '#047857', surface: '#FFFFFF' },
  { slug: 'terracotta', name: 'Terracotta', bg: '#7C2D12', accent: '#FDBA74', text: '#FFF7ED', muted: '#FED7AA', surface: '#9A3412' },
  { slug: 'plum', name: 'Plum', bg: '#581C87', accent: '#E9D5FF', text: '#FAF5FF', muted: '#D8B4FE', surface: '#6B21A8' },
  { slug: 'charcoal', name: 'Charcoal', bg: '#18181B', accent: '#F4F4F5', text: '#FAFAFA', muted: '#A1A1AA', surface: '#27272A' },
  { slug: 'blush', name: 'Blush', bg: '#FFF1F2', accent: '#E11D48', text: '#881337', muted: '#9F1239', surface: '#FFFFFF' },
]

function rect(o: {
  left: number
  top: number
  width: number
  height: number
  fill: string
  rx?: number
  opacity?: number
}): FabricObject {
  return {
    type: 'Rect',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    rx: o.rx ?? 0,
    ry: o.rx ?? 0,
    opacity: o.opacity ?? 1,
    strokeWidth: 0,
    ...o,
  }
}

function circle(o: {
  left: number
  top: number
  radius: number
  fill: string
  opacity?: number
}): FabricObject {
  return {
    type: 'Circle',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    opacity: o.opacity ?? 1,
    strokeWidth: 0,
    ...o,
  }
}

function text(o: {
  text: string
  left: number
  top: number
  width: number
  fontSize: number
  fill: string
  fontFamily?: string
  fontWeight?: string | number
  textAlign?: string
  lineHeight?: number
  charSpacing?: number
}): FabricObject {
  return {
    type: 'Textbox',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    fontFamily: o.fontFamily ?? FONT_BODY,
    fontWeight: o.fontWeight ?? 'normal',
    textAlign: o.textAlign ?? 'left',
    lineHeight: o.lineHeight ?? 1.16,
    charSpacing: o.charSpacing ?? 0,
    splitByGrapheme: false,
    strokeWidth: 0,
    ...o,
  }
}

function doc(background: string, objects: FabricObject[]) {
  return { version: '6.0.0', background, objects }
}

function scaleFont(base: number, w: number, h: number): number {
  const ref = Math.min(w, h)
  return Math.max(14, Math.round(base * (ref / 1080)))
}

function buildLayout(
  layout: LayoutId,
  w: number,
  h: number,
  p: Palette,
  theme: Theme
): ReturnType<typeof doc> {
  const fs = (n: number) => scaleFont(n, w, h)
  const m = Math.round(Math.min(w, h) * 0.07)
  const objects: FabricObject[] = []

  switch (layout) {
    case 'hero': {
      objects.push(
        circle({ left: w * 0.65, top: -h * 0.12, radius: w * 0.28, fill: p.accent, opacity: 0.22 }),
        circle({ left: -w * 0.12, top: h * 0.7, radius: w * 0.22, fill: p.accent, opacity: 0.18 }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.28,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.accent,
          fontWeight: 700,
          charSpacing: 80,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.36,
          width: w - m * 2,
          fontSize: fs(72),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.05,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.58,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.muted,
        }),
        rect({ left: m, top: h * 0.72, width: Math.min(w * 0.42, 420), height: fs(56), fill: p.accent, rx: fs(28) }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.72 + fs(14),
          width: Math.min(w * 0.42, 420),
          fontSize: fs(24),
          fill: p.bg,
          fontWeight: 700,
          textAlign: 'center',
        })
      )
      break
    }
    case 'split-left': {
      objects.push(
        rect({ left: 0, top: 0, width: w * 0.42, height: h, fill: p.surface }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.35,
          width: w * 0.35,
          fontSize: fs(22),
          fill: p.accent,
          fontWeight: 700,
          charSpacing: 60,
        }),
        text({
          text: theme.headline,
          left: w * 0.48,
          top: h * 0.28,
          width: w * 0.46,
          fontSize: fs(56),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.1,
        }),
        text({
          text: theme.sub,
          left: w * 0.48,
          top: h * 0.55,
          width: w * 0.46,
          fontSize: fs(26),
          fill: p.muted,
        }),
        text({
          text: theme.cta + ' →',
          left: w * 0.48,
          top: h * 0.75,
          width: w * 0.4,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
        })
      )
      break
    }
    case 'split-right': {
      objects.push(
        rect({ left: w * 0.58, top: 0, width: w * 0.42, height: h, fill: p.accent }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.3,
          width: w * 0.48,
          fontSize: fs(60),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.08,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.55,
          width: w * 0.48,
          fontSize: fs(26),
          fill: p.muted,
        }),
        text({
          text: theme.cta,
          left: w * 0.62,
          top: h * 0.45,
          width: w * 0.32,
          fontSize: fs(28),
          fill: p.bg,
          fontWeight: 800,
          textAlign: 'center',
        })
      )
      break
    }
    case 'banner-top': {
      objects.push(
        rect({ left: 0, top: 0, width: w, height: h * 0.22, fill: p.surface }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.08,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
          charSpacing: 100,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.32,
          width: w - m * 2,
          fontSize: fs(64),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.52,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.muted,
        }),
        rect({ left: m, top: h * 0.72, width: w - m * 2, height: 4, fill: p.accent, rx: 2 }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.78,
          width: w - m * 2,
          fontSize: fs(26),
          fill: p.accent,
          fontWeight: 700,
        })
      )
      break
    }
    case 'banner-bottom': {
      objects.push(
        text({
          text: theme.headline,
          left: m,
          top: h * 0.2,
          width: w - m * 2,
          fontSize: fs(68),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 900,
          lineHeight: 1.05,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.48,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.muted,
        }),
        rect({ left: 0, top: h * 0.72, width: w, height: h * 0.28, fill: p.surface }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.82,
          width: w - m * 2,
          fontSize: fs(32),
          fill: p.accent,
          fontWeight: 800,
          textAlign: 'center',
        })
      )
      break
    }
    case 'diagonal': {
      objects.push(
        rect({ left: -w * 0.1, top: h * 0.15, width: w * 1.3, height: h * 0.18, fill: p.accent, opacity: 0.9 }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.08,
          width: w - m * 2,
          fontSize: fs(22),
          fill: p.muted,
          fontWeight: 700,
          charSpacing: 90,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.18,
          width: w - m * 2,
          fontSize: fs(52),
          fill: p.bg,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.48,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.text,
        }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.75,
          width: Math.min(w * 0.5, 400),
          fontSize: fs(26),
          fill: p.accent,
          fontWeight: 700,
        })
      )
      break
    }
    case 'circles': {
      objects.push(
        circle({ left: w * 0.55, top: h * 0.05, radius: w * 0.2, fill: p.accent, opacity: 0.35 }),
        circle({ left: w * 0.7, top: h * 0.55, radius: w * 0.16, fill: p.surface, opacity: 0.8 }),
        circle({ left: -w * 0.08, top: h * 0.6, radius: w * 0.18, fill: p.accent, opacity: 0.2 }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.32,
          width: w * 0.55,
          fontSize: fs(58),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.08,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.58,
          width: w * 0.55,
          fontSize: fs(26),
          fill: p.muted,
        }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.78,
          width: w * 0.4,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
        })
      )
      break
    }
    case 'framed': {
      const inset = Math.round(Math.min(w, h) * 0.05)
      objects.push(
        rect({ left: inset, top: inset, width: w - inset * 2, height: h - inset * 2, fill: p.surface, rx: 16 }),
        rect({
          left: inset + 12,
          top: inset + 12,
          width: w - inset * 2 - 24,
          height: h - inset * 2 - 24,
          fill: p.bg,
          rx: 12,
        }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.25,
          width: w - m * 2,
          fontSize: fs(22),
          fill: p.accent,
          fontWeight: 700,
          textAlign: 'center',
          charSpacing: 100,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.35,
          width: w - m * 2,
          fontSize: fs(56),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.1,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.58,
          width: w - m * 2,
          fontSize: fs(26),
          fill: p.muted,
          textAlign: 'center',
        }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.75,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
          textAlign: 'center',
        })
      )
      break
    }
    case 'minimal': {
      objects.push(
        rect({ left: m, top: h * 0.42, width: Math.min(120, w * 0.12), height: 6, fill: p.accent, rx: 3 }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.48,
          width: w - m * 2,
          fontSize: fs(48),
          fill: p.text,
          fontFamily: FONT_SERIF,
          fontWeight: 700,
          lineHeight: 1.2,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.72,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.muted,
        })
      )
      break
    }
    case 'metrics': {
      const cardW = (w - m * 4) / 3
      const cardH = h * 0.42
      const top = h * 0.32
      for (let i = 0; i < 3; i++) {
        objects.push(
          rect({
            left: m + i * (cardW + m),
            top,
            width: cardW,
            height: cardH,
            fill: p.surface,
            rx: 16,
          }),
          text({
            text: `${(i + 2) * 12}×\nMetric ${i + 1}`,
            left: m + i * (cardW + m) + 16,
            top: top + cardH * 0.28,
            width: cardW - 32,
            fontSize: fs(36),
            fill: i === 1 ? p.accent : p.text,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.35,
          })
        )
      }
      objects.push(
        text({
          text: theme.headline,
          left: m,
          top: h * 0.1,
          width: w - m * 2,
          fontSize: fs(44),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
        }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.85,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
          textAlign: 'center',
        })
      )
      break
    }
    case 'quote': {
      objects.push(
        text({
          text: '“',
          left: m,
          top: h * 0.12,
          width: w * 0.2,
          fontSize: fs(140),
          fill: p.accent,
          fontFamily: FONT_SERIF,
          fontWeight: 700,
        }),
        text({
          text: theme.headline,
          left: m + 20,
          top: h * 0.35,
          width: w - m * 2 - 20,
          fontSize: fs(42),
          fill: p.text,
          fontFamily: FONT_SERIF,
          lineHeight: 1.35,
        }),
        text({
          text: `— ${theme.sub}`,
          left: m + 20,
          top: h * 0.72,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.muted,
        })
      )
      break
    }
    case 'photo-slot': {
      objects.push(
        rect({ left: m, top: m, width: w - m * 2, height: h * 0.48, fill: p.surface, rx: 20 }),
        text({
          text: 'Add photo',
          left: m,
          top: m + h * 0.2,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.muted,
          textAlign: 'center',
        }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.55,
          width: w - m * 2,
          fontSize: fs(20),
          fill: p.accent,
          fontWeight: 700,
          charSpacing: 80,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.62,
          width: w - m * 2,
          fontSize: fs(48),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
        }),
        text({
          text: `${theme.sub}  ·  ${theme.cta}`,
          left: m,
          top: h * 0.82,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.muted,
        })
      )
      break
    }
    case 'corner': {
      objects.push(
        rect({ left: 0, top: 0, width: w * 0.08, height: h, fill: p.accent }),
        rect({ left: 0, top: 0, width: w, height: h * 0.04, fill: p.accent }),
        text({
          text: theme.headline,
          left: m + w * 0.06,
          top: h * 0.28,
          width: w - m * 2 - w * 0.06,
          fontSize: fs(58),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.08,
        }),
        text({
          text: theme.sub,
          left: m + w * 0.06,
          top: h * 0.55,
          width: w - m * 2 - w * 0.06,
          fontSize: fs(26),
          fill: p.muted,
        }),
        text({
          text: theme.cta,
          left: m + w * 0.06,
          top: h * 0.78,
          width: w * 0.5,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
        })
      )
      break
    }
    case 'stack': {
      const bands = 3
      const bandH = (h - m * 2) / bands - 12
      for (let i = 0; i < bands; i++) {
        const fills = [p.surface, p.accent, p.surface]
        const texts = [theme.eyebrow, theme.headline, theme.cta]
        const fillsText = [p.text, p.bg, p.accent]
        objects.push(
          rect({
            left: m,
            top: m + i * (bandH + 12),
            width: w - m * 2,
            height: bandH,
            fill: fills[i],
            rx: 14,
          }),
          text({
            text: texts[i],
            left: m + 24,
            top: m + i * (bandH + 12) + bandH * 0.32,
            width: w - m * 2 - 48,
            fontSize: fs(i === 1 ? 40 : 28),
            fill: fillsText[i],
            fontFamily: i === 1 ? FONT_DISPLAY : FONT_BODY,
            fontWeight: 700,
            textAlign: 'center',
          })
        )
      }
      break
    }
    case 'bold-type': {
      objects.push(
        text({
          text: theme.headline.toUpperCase(),
          left: m * 0.6,
          top: h * 0.22,
          width: w - m * 1.2,
          fontSize: fs(96),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 900,
          lineHeight: 0.95,
        }),
        rect({ left: m, top: h * 0.7, width: Math.min(w * 0.35, 280), height: 8, fill: p.accent, rx: 4 }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.78,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.accent,
          fontWeight: 700,
        })
      )
      break
    }
    case 'grid-2': {
      const gap = Math.round(m * 0.45)
      const cellW = (w - m * 2 - gap) / 2
      const cellH = h * 0.55
      objects.push(
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.08,
          width: w - m * 2,
          fontSize: fs(22),
          fill: p.accent,
          fontWeight: 700,
          charSpacing: 80,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.14,
          width: w - m * 2,
          fontSize: fs(44),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
        }),
        rect({ left: m, top: h * 0.32, width: cellW, height: cellH, fill: p.surface, rx: 18 }),
        rect({ left: m + cellW + gap, top: h * 0.32, width: cellW, height: cellH, fill: p.accent, rx: 18 }),
        text({
          text: theme.sub,
          left: m + 20,
          top: h * 0.32 + cellH * 0.35,
          width: cellW - 40,
          fontSize: fs(26),
          fill: p.text,
          fontWeight: 600,
          textAlign: 'center',
        }),
        text({
          text: theme.cta,
          left: m + cellW + gap + 20,
          top: h * 0.32 + cellH * 0.4,
          width: cellW - 40,
          fontSize: fs(28),
          fill: p.bg,
          fontWeight: 800,
          textAlign: 'center',
        })
      )
      break
    }
    case 'ribbon': {
      objects.push(
        rect({ left: 0, top: h * 0.38, width: w, height: h * 0.24, fill: p.accent }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.18,
          width: w - m * 2,
          fontSize: fs(22),
          fill: p.muted,
          fontWeight: 700,
          charSpacing: 90,
          textAlign: 'center',
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.42,
          width: w - m * 2,
          fontSize: fs(52),
          fill: p.bg,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.08,
        }),
        text({
          text: `${theme.sub}  ·  ${theme.cta}`,
          left: m,
          top: h * 0.72,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.muted,
          textAlign: 'center',
        })
      )
      break
    }
    case 'timeline': {
      const steps = [theme.eyebrow, theme.headline, theme.cta]
      const stepW = (w - m * 2) / 3
      objects.push(
        rect({ left: m, top: h * 0.48, width: w - m * 2, height: 4, fill: p.surface, rx: 2 }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.12,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.muted,
          textAlign: 'center',
        })
      )
      for (let i = 0; i < 3; i++) {
        const cx = m + stepW * i + stepW / 2
        objects.push(
          circle({ left: cx - fs(14), top: h * 0.48 - fs(12), radius: fs(14), fill: i === 1 ? p.accent : p.surface }),
          text({
            text: steps[i],
            left: m + stepW * i + 8,
            top: h * 0.58,
            width: stepW - 16,
            fontSize: fs(22),
            fill: p.text,
            fontFamily: i === 1 ? FONT_DISPLAY : FONT_BODY,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
          })
        )
      }
      break
    }
    case 'spotlight': {
      objects.push(
        circle({ left: w * 0.5 - w * 0.22, top: h * 0.12, radius: w * 0.22, fill: p.surface, opacity: 0.9 }),
        circle({ left: w * 0.5 - w * 0.14, top: h * 0.2, radius: w * 0.14, fill: p.accent, opacity: 0.55 }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.55,
          width: w - m * 2,
          fontSize: fs(52),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.1,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.72,
          width: w - m * 2,
          fontSize: fs(26),
          fill: p.muted,
          textAlign: 'center',
        }),
        text({
          text: theme.cta,
          left: m,
          top: h * 0.84,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
          textAlign: 'center',
        })
      )
      break
    }
    case 'asymmetric': {
      objects.push(
        rect({ left: 0, top: 0, width: w * 0.62, height: h * 0.7, fill: p.surface }),
        rect({ left: w * 0.55, top: h * 0.45, width: w * 0.45, height: h * 0.55, fill: p.accent }),
        text({
          text: theme.eyebrow.toUpperCase(),
          left: m,
          top: h * 0.18,
          width: w * 0.5,
          fontSize: fs(20),
          fill: p.accent,
          fontWeight: 700,
          charSpacing: 70,
        }),
        text({
          text: theme.headline,
          left: m,
          top: h * 0.28,
          width: w * 0.5,
          fontSize: fs(48),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.08,
        }),
        text({
          text: theme.sub,
          left: w * 0.6,
          top: h * 0.58,
          width: w * 0.35,
          fontSize: fs(24),
          fill: p.bg,
        }),
        text({
          text: theme.cta,
          left: w * 0.6,
          top: h * 0.78,
          width: w * 0.35,
          fontSize: fs(26),
          fill: p.bg,
          fontWeight: 800,
        })
      )
      break
    }
    case 'footer-bar': {
      objects.push(
        text({
          text: theme.headline,
          left: m,
          top: h * 0.22,
          width: w - m * 2,
          fontSize: fs(60),
          fill: p.text,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          lineHeight: 1.05,
        }),
        text({
          text: theme.sub,
          left: m,
          top: h * 0.48,
          width: w - m * 2,
          fontSize: fs(28),
          fill: p.muted,
        }),
        rect({ left: 0, top: h * 0.82, width: w, height: h * 0.18, fill: p.surface }),
        text({
          text: `${theme.eyebrow}  ·  ${theme.cta}`,
          left: m,
          top: h * 0.88,
          width: w - m * 2,
          fontSize: fs(24),
          fill: p.accent,
          fontWeight: 700,
          textAlign: 'center',
        })
      )
      break
    }
  }

  return doc(p.bg, objects)
}

const SOCIAL_THEMES: Theme[] = [
  { slug: 'sale', name: 'Festival Sale', eyebrow: 'Limited offer', headline: 'Up to 50% off', sub: 'Festival sale on bestsellers', cta: 'Shop now' },
  { slug: 'launch', name: 'Product Launch', eyebrow: 'Just dropped', headline: 'Meet the new drop', sub: 'Fresh styles for the season', cta: 'Explore' },
  { slug: 'webinar', name: 'Webinar', eyebrow: 'Live session', headline: 'Grow your brand', sub: 'Free webinar this Friday', cta: 'Register' },
  { slug: 'testimonial', name: 'Testimonial', eyebrow: 'Customer love', headline: '“Game changer for us”', sub: 'Rated 4.9 by 2,000+ teams', cta: 'See stories' },
  { slug: 'hiring', name: 'We are hiring', eyebrow: 'Careers', headline: 'Join our team', sub: 'Remote-friendly roles open', cta: 'Apply now' },
  { slug: 'event', name: 'Event invite', eyebrow: 'You’re invited', headline: 'Open house night', sub: 'Meet us this weekend', cta: 'RSVP' },
  { slug: 'tips', name: 'Tips carousel', eyebrow: 'Pro tip', headline: '3 ways to save time', sub: 'Swipe for the checklist', cta: 'Save this' },
  { slug: 'menu', name: 'Today’s special', eyebrow: 'Kitchen specials', headline: 'Chef’s thali', sub: 'Fresh · Limited quantity', cta: 'Order' },
  { slug: 'app', name: 'App promo', eyebrow: 'Get the app', headline: 'Design on the go', sub: 'Templates in your pocket', cta: 'Download' },
  { slug: 'festive', name: 'Festive greetings', eyebrow: 'Season’s greetings', headline: 'Happy celebrations', sub: 'Wishing you prosperity', cta: 'Share' },
  { slug: 'discount', name: 'Flash deal', eyebrow: 'Today only', headline: 'Flat 30% off', sub: 'Use code SAVE30', cta: 'Claim deal' },
  { slug: 'collab', name: 'Collab', eyebrow: 'Partnership', headline: 'Better together', sub: 'Co-branded collection', cta: 'Discover' },
  { slug: 'unboxing', name: 'Unboxing', eyebrow: 'Unbox', headline: 'What’s inside', sub: 'First look at the kit', cta: 'Reveal' },
  { slug: 'before-after', name: 'Before after', eyebrow: 'Glow-up', headline: 'Before → After', sub: 'Same brief, sharper result', cta: 'Compare' },
]

const STORY_THEMES: Theme[] = [
  { slug: 'countdown', name: 'Countdown', eyebrow: 'Starting soon', headline: '24 hours left', sub: 'Sale ends midnight', cta: 'Shop before gone' },
  { slug: 'behind', name: 'Behind scenes', eyebrow: 'BTS', headline: 'How we make it', sub: 'A peek inside the studio', cta: 'Watch' },
  { slug: 'poll', name: 'Poll', eyebrow: 'Quick poll', headline: 'Which colour?', sub: 'Tap to vote', cta: 'Vote now' },
  { slug: 'qa', name: 'Q&A', eyebrow: 'Ask us', headline: 'Drop your questions', sub: 'We answer live at 7pm', cta: 'Ask' },
  { slug: 'offer', name: 'Story offer', eyebrow: 'Swipe up', headline: 'Buy 1 Get 1', sub: 'WhatsApp to order', cta: 'Message us' },
  { slug: 'reel', name: 'Reel hook', eyebrow: 'POV', headline: 'When the brief drops', sub: 'Follow for more', cta: 'Follow' },
  { slug: 'reminder', name: 'Reminder', eyebrow: 'Don’t forget', headline: 'Event tomorrow', sub: 'See you at 11am', cta: 'Add calendar' },
  { slug: 'quote-day', name: 'Quote of day', eyebrow: 'Motivation', headline: 'Start before you’re ready', sub: 'Daily design wisdom', cta: 'Share' },
  { slug: 'new', name: 'New in', eyebrow: 'Just in', headline: 'Fresh arrivals', sub: 'Link in bio', cta: 'Browse' },
  { slug: 'thanks', name: 'Thank you', eyebrow: 'Grateful', headline: '10K followers', sub: 'Thank you for the love', cta: 'Celebrate' },
  { slug: 'streak', name: 'Streak', eyebrow: 'Day 7', headline: 'Keep the streak', sub: 'One tip every day', cta: 'Continue' },
  { slug: 'link', name: 'Link highlight', eyebrow: 'Link in bio', headline: 'Everything here', sub: 'Shop · book · learn', cta: 'Tap link' },
]

const DECK_THEMES: Theme[] = [
  { slug: 'pitch', name: 'Pitch cover', eyebrow: 'Pitch deck', headline: 'Our company story', sub: 'Seed round 2026', cta: 'Let’s talk' },
  { slug: 'problem', name: 'Problem', eyebrow: 'The problem', headline: 'Markets move faster', sub: 'Teams drown in tools', cta: 'Next' },
  { slug: 'solution', name: 'Solution', eyebrow: 'Our solution', headline: 'One design stack', sub: 'Templates to publish', cta: 'See how' },
  { slug: 'market', name: 'Market', eyebrow: 'Opportunity', headline: '₹120Cr TAM', sub: 'SMB creative in India', cta: 'Deep dive' },
  { slug: 'product', name: 'Product', eyebrow: 'Product', headline: 'Editor that ships', sub: 'Brand · AI · export', cta: 'Demo' },
  { slug: 'traction', name: 'Traction', eyebrow: 'Traction', headline: '3× MoM growth', sub: 'Designs created weekly', cta: 'Metrics' },
  { slug: 'team', name: 'Team', eyebrow: 'Team', headline: 'Builders & designers', sub: 'Distributed across India', cta: 'Meet us' },
  { slug: 'roadmap', name: 'Roadmap', eyebrow: 'Roadmap', headline: 'What’s next', sub: 'Q1–Q4 priorities', cta: 'Timeline' },
  { slug: 'ask', name: 'The ask', eyebrow: 'The ask', headline: 'Raising Series A', sub: 'Fuel for template scale', cta: 'Contact' },
  { slug: 'thanks', name: 'Thanks', eyebrow: 'Closing', headline: 'Thank you', sub: 'Questions welcome', cta: 'Book a call' },
  { slug: 'swot', name: 'SWOT', eyebrow: 'Strategy', headline: 'SWOT at a glance', sub: 'Strengths to threats', cta: 'Discuss' },
  { slug: 'edu', name: 'Lesson', eyebrow: 'Lesson 01', headline: 'Design fundamentals', sub: '45-minute class', cta: 'Start' },
  { slug: 'portfolio', name: 'Portfolio', eyebrow: 'Portfolio', headline: 'Selected work', sub: '2024–2026', cta: 'View' },
  { slug: 'marketing', name: 'Marketing plan', eyebrow: 'Go-to-market', headline: 'Channel mix', sub: 'Audience · message · KPI', cta: 'Plan' },
  { slug: 'profile', name: 'Company profile', eyebrow: 'About us', headline: 'Who we are', sub: 'Mission and vision', cta: 'Learn more' },
  { slug: 'pricing', name: 'Pricing', eyebrow: 'Pricing', headline: 'Simple plans', sub: 'Start free · upgrade anytime', cta: 'Choose' },
  { slug: 'competition', name: 'Competition', eyebrow: 'Landscape', headline: 'How we win', sub: 'Speed · suite · India-first', cta: 'Compare' },
]

const PRINT_THEMES: Theme[] = [
  { slug: 'grand', name: 'Grand opening', eyebrow: 'Grand opening', headline: 'We’re open', sub: 'Visit this weekend', cta: 'Get directions' },
  { slug: 'sale-flyer', name: 'Sale flyer', eyebrow: 'Mega sale', headline: 'Everything 40% off', sub: 'In-store & online', cta: 'Visit us' },
  { slug: 'menu', name: 'Menu', eyebrow: 'Menu', headline: 'Seasonal plates', sub: 'GST inclusive', cta: 'Reserve' },
  { slug: 'workshop', name: 'Workshop', eyebrow: 'Workshop', headline: 'Learn Indobase Design', sub: 'Saturday · 2 hours', cta: 'Register' },
  { slug: 'realty', name: 'Real estate', eyebrow: 'For sale', headline: '3BHK ready', sub: 'Prime location', cta: 'Call now' },
  { slug: 'tuition', name: 'Tuition', eyebrow: 'Admissions open', headline: 'Batch starting', sub: 'Limited seats', cta: 'Enrol' },
  { slug: 'clinic', name: 'Clinic', eyebrow: 'Health camp', headline: 'Free check-up', sub: 'This Sunday', cta: 'Book slot' },
  { slug: 'cafe', name: 'Cafe promo', eyebrow: 'Cafe specials', headline: 'Brunch hours', sub: '10am – 2pm', cta: 'See menu' },
  { slug: 'price', name: 'Price list', eyebrow: 'Price list', headline: 'Transparent rates', sub: 'No hidden fees', cta: 'Enquire' },
  { slug: 'fest', name: 'Fest poster', eyebrow: 'Community fest', headline: 'Block party', sub: 'Music · food · fun', cta: 'Join' },
  { slug: 'job-fair', name: 'Job fair', eyebrow: 'Hiring drive', headline: 'Walk-in interviews', sub: 'Bring your resume', cta: 'Attend' },
  { slug: 'lost', name: 'Lost found', eyebrow: 'Notice', headline: 'Lost & found', sub: 'Contact reception', cta: 'Report' },
]

const LOGO_THEMES: Theme[] = [
  { slug: 'wordmark', name: 'Wordmark', eyebrow: 'Brand', headline: 'Indobase', sub: 'Design studio', cta: '™' },
  { slug: 'initials', name: 'Initials', eyebrow: 'Mark', headline: 'IB', sub: 'Identity kit', cta: 'Brand' },
  { slug: 'badge', name: 'Badge', eyebrow: 'Est. 2024', headline: 'Craft Co.', sub: 'Handmade goods', cta: 'Logo' },
  { slug: 'serif', name: 'Serif logo', eyebrow: 'Atelier', headline: 'Lumen', sub: 'Creative house', cta: '®' },
  { slug: 'tech', name: 'Tech mark', eyebrow: 'Product', headline: 'Nova', sub: 'Cloud native', cta: 'Logo' },
  { slug: 'food', name: 'Food brand', eyebrow: 'Kitchen', headline: 'Masala', sub: 'Cloud kitchen', cta: 'Brand' },
  { slug: 'fitness', name: 'Fitness', eyebrow: 'Studio', headline: 'Pulse', sub: 'Train daily', cta: 'Mark' },
  { slug: 'edu-logo', name: 'Education', eyebrow: 'Academy', headline: 'Scholar', sub: 'Learn better', cta: 'Logo' },
  { slug: 'travel', name: 'Travel', eyebrow: 'Journeys', headline: 'Yatra', sub: 'Go further', cta: 'Mark' },
  { slug: 'beauty', name: 'Beauty', eyebrow: 'Beauty', headline: 'Glow', sub: 'Skincare lab', cta: 'Brand' },
]

const DOCS_THEMES: Theme[] = [
  { slug: 'resume', name: 'Resume', eyebrow: 'Curriculum vitae', headline: 'Your Name', sub: 'Product designer · Bangalore', cta: 'Contact' },
  { slug: 'cover', name: 'Cover letter', eyebrow: 'Application', headline: 'Dear hiring team', sub: 'Role: Design lead', cta: 'Respectfully' },
  { slug: 'invoice', name: 'Invoice', eyebrow: 'Tax invoice', headline: 'Invoice #1042', sub: 'Due in 15 days', cta: 'Pay now' },
  { slug: 'proposal', name: 'Proposal', eyebrow: 'Proposal', headline: 'Project outline', sub: 'Scope · timeline · fee', cta: 'Approve' },
  { slug: 'report', name: 'Report', eyebrow: 'Monthly report', headline: 'May highlights', sub: 'KPIs and next steps', cta: 'Read' },
  { slug: 'certificate', name: 'Certificate', eyebrow: 'Certificate of completion', headline: 'Awarded to', sub: 'Design fundamentals', cta: 'Signed' },
  { slug: 'letterhead', name: 'Letterhead', eyebrow: 'Official', headline: 'Company letterhead', sub: 'Address · GSTIN', cta: 'Letter' },
  { slug: 'agenda', name: 'Meeting agenda', eyebrow: 'Agenda', headline: 'Weekly sync', sub: 'Topics and owners', cta: 'Start' },
  { slug: 'brief', name: 'Creative brief', eyebrow: 'Brief', headline: 'Campaign brief', sub: 'Goals · audience · tone', cta: 'Share' },
  { slug: 'onepager', name: 'One-pager', eyebrow: 'Overview', headline: 'Product one-pager', sub: 'Features and pricing', cta: 'Download' },
  { slug: 'nda', name: 'NDA cover', eyebrow: 'Confidential', headline: 'Non-disclosure', sub: 'Mutual agreement', cta: 'Sign' },
  { slug: 'quote-doc', name: 'Quote', eyebrow: 'Quotation', headline: 'Project quote', sub: 'Valid for 14 days', cta: 'Accept' },
]

const CARD_THEMES: Theme[] = [
  { slug: 'classic', name: 'Classic card', eyebrow: 'Founder', headline: 'Your Name', sub: 'hello@business.in', cta: '+91' },
  { slug: 'minimal-card', name: 'Minimal card', eyebrow: 'Designer', headline: 'A. Sharma', sub: 'Portfolio on request', cta: 'Connect' },
  { slug: 'bold-card', name: 'Bold card', eyebrow: 'Agency', headline: 'Studio Lead', sub: 'Brand & digital', cta: 'Book' },
  { slug: 'dark-card', name: 'Dark card', eyebrow: 'Consultant', headline: 'Strategy+', sub: 'Growth advisory', cta: 'Call' },
  { slug: 'accent-card', name: 'Accent bar', eyebrow: 'Sales', headline: 'Account manager', sub: 'North India', cta: 'WhatsApp' },
  { slug: 'qr-card', name: 'QR ready', eyebrow: 'Scan me', headline: 'Digital card', sub: 'Save contact', cta: 'QR' },
  { slug: 'bilingual', name: 'Bilingual', eyebrow: 'नमस्ते', headline: 'Your Name', sub: 'Founder · भारत', cta: 'Contact' },
  { slug: 'startup', name: 'Startup', eyebrow: 'Co-founder', headline: 'Building Indobase', sub: 'design.indobase.in', cta: 'Meet' },
  { slug: 'doctor', name: 'Doctor card', eyebrow: 'Clinic', headline: 'Dr. Name', sub: 'MBBS · Appointments', cta: 'Book' },
  { slug: 'realtor', name: 'Realtor', eyebrow: 'Realty', headline: 'Property advisor', sub: 'Buy · sell · rent', cta: 'Call' },
]

const YT_THEMES: Theme[] = [
  { slug: 'howto', name: 'How-to', eyebrow: 'Tutorial', headline: 'Build this in 10 min', sub: 'Step-by-step', cta: 'Watch' },
  { slug: 'list', name: 'Listicle', eyebrow: 'Top 5', headline: 'Mistakes to avoid', sub: 'Creators edition', cta: 'Play' },
  { slug: 'react', name: 'Reaction', eyebrow: 'React', headline: 'We tried it live', sub: 'Honest review', cta: 'Watch' },
  { slug: 'news', name: 'News', eyebrow: 'Update', headline: 'Big announcement', sub: 'What changed', cta: 'Watch now' },
  { slug: 'vs', name: 'Versus', eyebrow: 'Compare', headline: 'A vs B', sub: 'Which wins?', cta: 'Decide' },
  { slug: 'course', name: 'Course', eyebrow: 'Free class', headline: 'Design 101', sub: 'Beginner friendly', cta: 'Start' },
  { slug: 'podcast', name: 'Podcast', eyebrow: 'Episode 12', headline: 'Founder stories', sub: 'Audio + video', cta: 'Listen' },
  { slug: 'challenge', name: 'Challenge', eyebrow: 'Challenge', headline: '7-day redesign', sub: 'Join along', cta: 'Join' },
  { slug: 'tips-yt', name: 'Tips', eyebrow: 'Quick tip', headline: 'One setting change', sub: 'Instant upgrade', cta: 'Try' },
  { slug: 'live', name: 'Live', eyebrow: 'Going live', headline: 'AMA session', sub: 'Ask anything', cta: 'Remind me' },
  { slug: 'shorts', name: 'Shorts title', eyebrow: 'Shorts', headline: 'Wait for it…', sub: '15-second hook', cta: 'Watch' },
  { slug: 'series', name: 'Series', eyebrow: 'Part 1', headline: 'Design series', sub: 'New every Monday', cta: 'Subscribe' },
]

const LI_THEMES: Theme[] = [
  { slug: 'thought', name: 'Thought leadership', eyebrow: 'Insight', headline: 'What we learned shipping', sub: '3 takeaways', cta: 'Read more' },
  { slug: 'case', name: 'Case study', eyebrow: 'Case study', headline: '3× more leads', sub: 'How a SMB did it', cta: 'Learn more' },
  { slug: 'hiring-li', name: 'Hiring', eyebrow: 'We’re hiring', headline: 'Design engineer', sub: 'Remote · India', cta: 'Apply' },
  { slug: 'event-li', name: 'Event', eyebrow: 'Webinar', headline: 'Design systems talk', sub: 'Thursday 5pm IST', cta: 'Register' },
  { slug: 'milestone', name: 'Milestone', eyebrow: 'Milestone', headline: '10,000 designs', sub: 'Thank you community', cta: 'Celebrate' },
  { slug: 'carousel', name: 'Carousel', eyebrow: 'Carousel', headline: 'Framework in 5 slides', sub: 'Save for later', cta: 'Swipe' },
  { slug: 'cover', name: 'Cover banner', eyebrow: 'Company', headline: 'Building for India', sub: 'Auth · data · design', cta: 'Follow' },
  { slug: 'quote-li', name: 'Quote post', eyebrow: 'Quote', headline: 'Clarity beats polish', sub: 'Weekly note', cta: 'Comment' },
  { slug: 'launch-li', name: 'Product launch', eyebrow: 'Launch', headline: 'Now generally available', sub: 'What ships today', cta: 'Try' },
  { slug: 'stats', name: 'Stats post', eyebrow: 'Data', headline: 'Numbers that matter', sub: 'Q2 snapshot', cta: 'See chart' },
]

const ADS_THEMES: Theme[] = [
  { slug: 'product-ad', name: 'Product ad', eyebrow: 'New', headline: '{{product_name}}', sub: '{{price}} · Free shipping', cta: 'Shop now' },
  { slug: 'lead', name: 'Lead gen', eyebrow: 'Free guide', headline: 'Download the playbook', sub: 'Email required', cta: 'Get PDF' },
  { slug: 'app-install', name: 'App install', eyebrow: 'Mobile', headline: 'Try Indobase Design', sub: 'Templates on demand', cta: 'Install' },
  { slug: 'retarget', name: 'Retargeting', eyebrow: 'Still thinking?', headline: 'Your cart misses you', sub: 'Extra 10% today', cta: 'Complete order' },
  { slug: 'brand-ad', name: 'Brand awareness', eyebrow: 'Brand', headline: 'Design that converts', sub: 'Made for Indian SMBs', cta: 'Learn more' },
  { slug: 'local', name: 'Local awareness', eyebrow: 'Near you', headline: 'Visit our store', sub: 'Open till 9pm', cta: 'Directions' },
  { slug: 'video-still', name: 'Video still', eyebrow: 'Watch', headline: 'See it in action', sub: '30-second demo', cta: 'Play' },
  { slug: 'offer-ad', name: 'Offer ad', eyebrow: 'Limited', headline: 'Weekend special', sub: 'Ends Sunday', cta: 'Claim' },
  { slug: 'trial', name: 'Free trial', eyebrow: 'Try free', headline: '14 days free', sub: 'No card needed', cta: 'Start trial' },
  { slug: 'webinar-ad', name: 'Webinar ad', eyebrow: 'Live', headline: 'Masterclass seats', sub: 'Limited spots', cta: 'Reserve' },
]

const MARKETING_THEMES: Theme[] = [
  { slug: 'campaign', name: 'Campaign', eyebrow: 'Campaign', headline: 'Summer push', sub: 'Channels locked', cta: 'Launch' },
  { slug: 'email-hero', name: 'Email hero', eyebrow: 'Newsletter', headline: 'This week’s picks', sub: 'Templates & tips', cta: 'Open email' },
  { slug: 'landing', name: 'Landing hero', eyebrow: 'Landing', headline: 'Create faster', sub: 'From brief to publish', cta: 'Start free' },
  { slug: 'promo-kit', name: 'Promo kit', eyebrow: 'Kit', headline: 'Launch assets', sub: 'Posts · stories · ads', cta: 'Download kit' },
  { slug: 'partner', name: 'Partner', eyebrow: 'Partners', headline: 'Co-marketing', sub: 'Shared audience', cta: 'Partner' },
  { slug: 'seasonal', name: 'Seasonal', eyebrow: 'Seasonal', headline: 'Festive campaign', sub: 'Ready-to-adapt creatives', cta: 'Browse' },
  { slug: 'ugc', name: 'UGC', eyebrow: 'Community', headline: 'Made by you', sub: 'Featured designs', cta: 'Submit' },
  { slug: 'referral', name: 'Referral', eyebrow: 'Refer', headline: 'Give ₹500, get ₹500', sub: 'Invite a founder', cta: 'Invite' },
  { slug: 'feature', name: 'Feature drop', eyebrow: 'New feature', headline: 'Brand kit sync', sub: 'One click apply', cta: 'Try it' },
  { slug: 'comparison', name: 'Comparison', eyebrow: 'Why us', headline: 'Less tool sprawl', sub: 'Design in the suite', cta: 'Compare' },
  { slug: 'press', name: 'Press kit', eyebrow: 'Press', headline: 'Media assets', sub: 'Logos · screenshots', cta: 'Download' },
  { slug: 'webinar-mkt', name: 'Webinar promo', eyebrow: 'Webinar', headline: 'Fill the room', sub: 'Promo pack ready', cta: 'Promote' },
]

const EDU_THEMES: Theme[] = [
  { slug: 'lesson', name: 'Lesson title', eyebrow: 'Lesson', headline: 'Colour theory basics', sub: 'Grade 9 · 40 min', cta: 'Begin' },
  { slug: 'worksheet', name: 'Worksheet', eyebrow: 'Practice', headline: 'Layout worksheet', sub: 'Fill in the blanks', cta: 'Print' },
  { slug: 'quiz', name: 'Quiz', eyebrow: 'Quiz time', headline: 'Check your knowledge', sub: '10 questions', cta: 'Start quiz' },
  { slug: 'timetable', name: 'Timetable', eyebrow: 'Schedule', headline: 'Week at a glance', sub: 'Mon–Fri blocks', cta: 'View' },
  { slug: 'announcement', name: 'Announcement', eyebrow: 'School notice', headline: 'PTM this Friday', sub: 'Parents welcome', cta: 'Note' },
  { slug: 'certificate-edu', name: 'Certificate', eyebrow: 'Achievement', headline: 'Course complete', sub: 'With distinction', cta: 'Award' },
  { slug: 'science', name: 'Science fair', eyebrow: 'Fair', headline: 'Project showcase', sub: 'Judging at 3pm', cta: 'Visit' },
  { slug: 'language', name: 'Language', eyebrow: 'Vocabulary', headline: 'Word of the day', sub: 'Use it thrice', cta: 'Learn' },
  { slug: 'math', name: 'Math', eyebrow: 'Problem set', headline: 'Fractions review', sub: 'Show your work', cta: 'Solve' },
  { slug: 'classroom', name: 'Classroom rules', eyebrow: 'Rules', headline: 'Respect & focus', sub: 'Our classroom norms', cta: 'Agree' },
  { slug: 'lab', name: 'Lab safety', eyebrow: 'Lab', headline: 'Safety first', sub: 'Goggles on', cta: 'Read' },
  { slug: 'project', name: 'Project brief', eyebrow: 'Project', headline: 'Term project', sub: 'Due next Friday', cta: 'Start' },
]

const BRAND_THEMES: Theme[] = [
  { slug: 'kit', name: 'Brand kit', eyebrow: 'Brand kit', headline: '{{brand_name}}', sub: 'Colours · fonts · logo', cta: 'Apply' },
  { slug: 'guidelines', name: 'Guidelines', eyebrow: 'Guidelines', headline: 'Do / Don’t', sub: 'Clear space rules', cta: 'Follow' },
  { slug: 'palette', name: 'Palette board', eyebrow: 'Palette', headline: 'Primary system', sub: 'Accent & neutrals', cta: 'Copy hex' },
  { slug: 'social-kit', name: 'Social kit', eyebrow: 'Social', headline: 'Profile set', sub: 'Avatar · cover · posts', cta: 'Use' },
  { slug: 'voice', name: 'Voice', eyebrow: 'Tone of voice', headline: 'How we speak', sub: 'Friendly · clear · bold', cta: 'Write' },
  { slug: 'mock', name: 'Mockup board', eyebrow: 'Mockups', headline: 'In situ', sub: 'Card · phone · poster', cta: 'Present' },
  { slug: 'iconography', name: 'Icons', eyebrow: 'Icons', headline: 'Icon system', sub: 'Line · filled · duo', cta: 'Browse' },
  { slug: 'typography', name: 'Type ramp', eyebrow: 'Typography', headline: 'Type scale', sub: 'Display to caption', cta: 'Apply' },
]

type CategorySpec = {
  category: string
  sizes: Array<{ w: number; h: number; label: string }>
  layouts: LayoutId[]
  themes: Theme[]
  /** Extra palette rotations per combo to pad volume with real recolors. */
  palettePasses?: number
}

const SPECS: CategorySpec[] = [
  {
    category: 'social',
    sizes: [{ w: 1080, h: 1080, label: 'IG' }],
    layouts: ['hero', 'split-left', 'split-right', 'circles', 'framed', 'photo-slot', 'bold-type', 'corner', 'stack', 'banner-top', 'grid-2', 'ribbon', 'spotlight'],
    themes: SOCIAL_THEMES,
    palettePasses: 1,
  },
  {
    category: 'instagram',
    sizes: [
      { w: 1080, h: 1080, label: 'Feed' },
      { w: 1080, h: 1350, label: 'Portrait' },
    ],
    layouts: ['hero', 'photo-slot', 'framed', 'minimal', 'circles', 'bold-type', 'grid-2', 'ribbon', 'asymmetric'],
    themes: SOCIAL_THEMES.slice(0, 10),
    palettePasses: 1,
  },
  {
    category: 'story',
    sizes: [{ w: 1080, h: 1920, label: 'Story' }],
    layouts: ['hero', 'split-left', 'circles', 'bold-type', 'banner-bottom', 'stack', 'photo-slot', 'diagonal', 'spotlight', 'footer-bar', 'ribbon'],
    themes: STORY_THEMES,
    palettePasses: 1,
  },
  {
    category: 'presentation',
    sizes: [{ w: 1920, h: 1080, label: '16:9' }],
    layouts: ['hero', 'split-left', 'split-right', 'metrics', 'quote', 'banner-top', 'framed', 'corner', 'minimal', 'stack', 'timeline', 'grid-2', 'asymmetric'],
    themes: DECK_THEMES,
    palettePasses: 1,
  },
  {
    category: 'poster',
    sizes: [{ w: 1080, h: 1350, label: 'Poster' }],
    layouts: ['hero', 'bold-type', 'diagonal', 'banner-bottom', 'circles', 'framed', 'photo-slot', 'corner', 'spotlight', 'ribbon', 'footer-bar'],
    themes: PRINT_THEMES,
    palettePasses: 1,
  },
  {
    category: 'flyer',
    sizes: [{ w: 1240, h: 1754, label: 'A4' }],
    layouts: ['banner-top', 'split-left', 'photo-slot', 'framed', 'stack', 'corner', 'grid-2', 'footer-bar', 'asymmetric'],
    themes: PRINT_THEMES.slice(0, 10),
    palettePasses: 1,
  },
  {
    category: 'print',
    sizes: [
      { w: 1080, h: 1350, label: 'Print' },
      { w: 1240, h: 1754, label: 'A4' },
    ],
    layouts: ['hero', 'banner-bottom', 'metrics', 'framed', 'ribbon', 'timeline', 'footer-bar'],
    themes: PRINT_THEMES.slice(0, 8),
    palettePasses: 1,
  },
  {
    category: 'logo',
    sizes: [{ w: 1080, h: 1080, label: 'Logo' }],
    layouts: ['minimal', 'framed', 'circles', 'bold-type', 'corner', 'hero', 'spotlight', 'ribbon'],
    themes: LOGO_THEMES,
    palettePasses: 2,
  },
  {
    category: 'docs',
    sizes: [{ w: 1275, h: 1650, label: 'Letter' }],
    layouts: ['banner-top', 'corner', 'minimal', 'framed', 'split-left', 'stack', 'timeline', 'footer-bar', 'grid-2'],
    themes: DOCS_THEMES,
    palettePasses: 1,
  },
  {
    category: 'resume',
    sizes: [{ w: 1240, h: 1754, label: 'A4' }],
    layouts: ['banner-top', 'split-left', 'corner', 'minimal', 'framed', 'timeline', 'footer-bar'],
    themes: DOCS_THEMES.slice(0, 8),
    palettePasses: 1,
  },
  {
    category: 'business-card',
    sizes: [{ w: 1050, h: 600, label: 'Card' }],
    layouts: ['corner', 'split-left', 'minimal', 'banner-top', 'framed', 'asymmetric', 'footer-bar', 'ribbon'],
    themes: CARD_THEMES,
    palettePasses: 1,
  },
  {
    category: 'youtube',
    sizes: [{ w: 1280, h: 720, label: 'Thumb' }],
    layouts: ['split-left', 'split-right', 'bold-type', 'hero', 'diagonal', 'photo-slot', 'spotlight', 'grid-2', 'asymmetric'],
    themes: YT_THEMES,
    palettePasses: 1,
  },
  {
    category: 'linkedin',
    sizes: [
      { w: 1080, h: 1080, label: 'Post' },
      { w: 1584, h: 396, label: 'Cover' },
    ],
    layouts: ['banner-top', 'split-left', 'quote', 'metrics', 'hero', 'minimal', 'timeline', 'grid-2', 'footer-bar'],
    themes: LI_THEMES,
    palettePasses: 1,
  },
  {
    category: 'ads',
    sizes: [
      { w: 1080, h: 1080, label: 'Square' },
      { w: 1200, h: 628, label: 'Landscape' },
    ],
    layouts: ['hero', 'photo-slot', 'split-right', 'bold-type', 'banner-bottom', 'framed', 'spotlight', 'ribbon', 'asymmetric'],
    themes: ADS_THEMES,
    palettePasses: 1,
  },
  {
    category: 'marketing',
    sizes: [{ w: 1080, h: 1080, label: 'Square' }],
    layouts: ['hero', 'metrics', 'stack', 'split-left', 'circles', 'photo-slot', 'framed', 'banner-top', 'timeline', 'grid-2'],
    themes: MARKETING_THEMES,
    palettePasses: 1,
  },
  {
    category: 'education',
    sizes: [
      { w: 1920, h: 1080, label: 'Slide' },
      { w: 1080, h: 1350, label: 'Poster' },
    ],
    layouts: ['banner-top', 'split-left', 'framed', 'stack', 'quote', 'metrics', 'timeline', 'grid-2', 'footer-bar'],
    themes: EDU_THEMES,
    palettePasses: 1,
  },
  {
    category: 'brand',
    sizes: [{ w: 1080, h: 1080, label: 'Square' }],
    layouts: ['framed', 'metrics', 'minimal', 'stack', 'photo-slot', 'grid-2', 'timeline', 'spotlight'],
    themes: BRAND_THEMES,
    palettePasses: 1,
  },
]

/** Generate the large procedural catalog (~2300+; plus builtins/decks → ~2500). */
export function generateCatalogTemplates(startSort = 1000): SeedTemplate[] {
  const out: SeedTemplate[] = []
  let sort = startSort
  const seen = new Set<string>()

  for (const spec of SPECS) {
    const passes = Math.max(1, spec.palettePasses ?? 1)
    for (let pass = 0; pass < passes; pass++) {
      for (let li = 0; li < spec.layouts.length; li++) {
        const layout = spec.layouts[li]
        for (let ti = 0; ti < spec.themes.length; ti++) {
          const theme = spec.themes[ti]
          for (let si = 0; si < spec.sizes.length; si++) {
            const size = spec.sizes[si]
            const palette = PALETTES[(li * 3 + ti * 5 + si * 7 + pass * 11) % PALETTES.length]
            const slug = `cat-${spec.category}-${layout}-${theme.slug}-${size.label.toLowerCase()}-${palette.slug}${pass > 0 ? `-p${pass}` : ''}`
              .replace(/\s+/g, '-')
              .toLowerCase()
            if (seen.has(slug)) continue
            seen.add(slug)

            // Second structural tweak: nudge geometry for pass>0 via alternate layout cycle
            const layoutUse =
              pass === 0
                ? layout
                : spec.layouts[(li + pass + ti) % spec.layouts.length]

            out.push({
              slug,
              name: `${theme.name} · ${palette.name} · ${size.label}`,
              category: spec.category,
              width: size.w,
              height: size.h,
              sortOrder: sort++,
              canvas: buildLayout(layoutUse, size.w, size.h, palette, theme),
            })
          }
        }
      }
    }
  }

  return out
}

/** Category → count helper for tests / diagnostics. */
export function catalogCountsByCategory(): Record<string, number> {
  const all = generateCatalogTemplates()
  const by: Record<string, number> = {}
  for (const t of all) {
    by[t.category] = (by[t.category] || 0) + 1
  }
  return by
}
