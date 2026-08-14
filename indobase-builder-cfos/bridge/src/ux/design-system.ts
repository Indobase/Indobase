import { createHash } from 'node:crypto'
import type { BusinessSpec } from './business-spec.js'

export type DesignTokens = {
  primary: string
  secondary: string
  accent: string
  background: string
  foreground: string
  muted: string
  border: string
  headingFont: string
  bodyFont: string
  radius: string
  density: 'airy' | 'regular' | 'dense'
  nav: 'bar' | 'split' | 'editorial'
  personality: string
}

const FAMILIES: Array<Omit<DesignTokens, 'personality'>> = [
  {
    primary: '#7A1F1F',
    secondary: '#C45C26',
    accent: '#E8A838',
    background: '#FBF4EA',
    foreground: '#2A1510',
    muted: '#7A5848',
    border: '#E6D2C0',
    headingFont: 'Fraunces, Georgia, serif',
    bodyFont: 'Source Sans 3, system-ui, sans-serif',
    radius: '4px',
    density: 'regular',
    nav: 'split',
  },
  {
    primary: '#12263A',
    secondary: '#1B6B93',
    accent: '#C45C26',
    background: '#F4F1EA',
    foreground: '#101820',
    muted: '#5C6670',
    border: '#D7D2C8',
    headingFont: 'IBM Plex Sans, system-ui, sans-serif',
    bodyFont: 'IBM Plex Sans, system-ui, sans-serif',
    radius: '2px',
    density: 'dense',
    nav: 'bar',
  },
  {
    primary: '#1F3D2B',
    secondary: '#3E6B4F',
    accent: '#C9A227',
    background: '#F7F4EE',
    foreground: '#142018',
    muted: '#5E6A62',
    border: '#D9E0D6',
    headingFont: 'Playfair Display, Georgia, serif',
    bodyFont: 'Nunito Sans, system-ui, sans-serif',
    radius: '18px',
    density: 'airy',
    nav: 'editorial',
  },
  {
    primary: '#2C1A4D',
    secondary: '#6B3FA0',
    accent: '#E07A5F',
    background: '#F8F5FF',
    foreground: '#1A1228',
    muted: '#6E6480',
    border: '#E3DCF0',
    headingFont: 'Space Grotesk, system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    radius: '10px',
    density: 'regular',
    nav: 'bar',
  },
]

function familyIndex(seed: string): number {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 8)
  return Number.parseInt(hex, 16) % FAMILIES.length
}

export function designTokensFromSpec(spec: Pick<BusinessSpec, 'businessName' | 'catalog' | 'businessType' | 'visualStyle' | 'sourceIntent'>): DesignTokens {
  const vertical = spec.catalog.verticalId
  let idx = familyIndex(`${spec.businessName}|${vertical}|${spec.businessType}|${spec.visualStyle}`)
  if (vertical === 'food-grocery') idx = 0
  else if (spec.businessType === 'saas') idx = 1
  else if (vertical === 'electronics') idx = 1
  else if (/\bluxury|jewelry|jewellery\b/i.test(spec.sourceIntent || spec.visualStyle)) idx = 2
  const base = FAMILIES[idx]!
  return {
    ...base,
    personality: `${spec.businessType}:${vertical}:${base.nav}:${base.density}`,
  }
}

export type DesignSpec = {
  brandName: string
  visualDirection: string
  colorPalette: DesignTokens
  typography: { heading: string; body: string }
  spacing: DesignTokens['density']
  radius: string
  imagery: string
  layout: DesignTokens['nav']
  components: { card: string; button: string }
  interactionStyle: string
  responsiveRules: string
  specHash: string
}

export function designSpecFromBusinessSpec(
  spec: Pick<BusinessSpec, 'businessName' | 'catalog' | 'businessType' | 'visualStyle' | 'sourceIntent'>,
): DesignSpec {
  const tokens = designTokensFromSpec(spec)
  const payload = JSON.stringify({
    brand: spec.businessName,
    vertical: spec.catalog.verticalId,
    type: spec.businessType,
    tokens,
  })
  return {
    brandName: spec.businessName,
    visualDirection: spec.visualStyle,
    colorPalette: tokens,
    typography: { heading: tokens.headingFont, body: tokens.bodyFont },
    spacing: tokens.density,
    radius: tokens.radius,
    imagery: spec.catalog.verticalId === 'food-grocery' ? 'warm-editorial' : 'product-forward',
    layout: tokens.nav,
    components: { card: tokens.nav === 'editorial' ? 'soft' : 'sharp', button: 'solid' },
    interactionStyle: tokens.density,
    responsiveRules: 'stack-below-720',
    specHash: createHash('sha256').update(payload).digest('hex').slice(0, 16),
  }
}

export function cssVariablesFromTokens(tokens: DesignTokens): string {
  return `:root{--ink:${tokens.foreground};--muted:${tokens.muted};--line:${tokens.border};--bg:${tokens.background};--card:#fff;--accent:${tokens.accent};--accent-ink:#fff;--primary:${tokens.primary};--secondary:${tokens.secondary};--radius:${tokens.radius};--heading:${tokens.headingFont};--body:${tokens.bodyFont};}`
}
