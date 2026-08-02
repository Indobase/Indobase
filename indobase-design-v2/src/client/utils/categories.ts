/** Shared category labels for Design home + editor. */
export const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  social: 'Social',
  instagram: 'Instagram',
  story: 'Stories & Reels',
  presentation: 'Presentations',
  poster: 'Posters',
  flyer: 'Flyers',
  print: 'Print',
  logo: 'Logos',
  docs: 'Docs',
  doc: 'Docs',
  resume: 'Resumes',
  'business-card': 'Business cards',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  ads: 'Ads',
  marketing: 'Marketing',
  education: 'Education',
  brand: 'Brand',
  video: 'Video',
  whiteboard: 'Whiteboard',
  sheet: 'Sheet',
  website: 'Website',
  other: 'Other',
}

/** Preferred left-rail / home tab order. */
export const CATEGORY_ORDER = [
  'presentation',
  'social',
  'instagram',
  'story',
  'video',
  'youtube',
  'linkedin',
  'ads',
  'marketing',
  'poster',
  'flyer',
  'print',
  'logo',
  'business-card',
  'docs',
  'doc',
  'resume',
  'education',
  'whiteboard',
  'sheet',
  'website',
  'brand',
] as const

/** Infer a home "type" bucket from canvas dimensions (for Recents filters). */
export function inferDesignType(width: number, height: number): string {
  if (width <= 0 || height <= 0) return 'other'
  const r = width / height
  if (Math.abs(r - 16 / 9) < 0.08) return 'presentation'
  if (Math.abs(r - 1) < 0.08) return 'social'
  if (Math.abs(r - 9 / 16) < 0.08) return 'video'
  if (Math.abs(r - 4 / 5) < 0.1) return 'poster'
  if (Math.abs(r - 1440 / 900) < 0.1 || Math.abs(r - 16 / 10) < 0.08) return 'website'
  if (r < 0.85) return 'doc'
  if (r > 1.2) return 'presentation'
  return 'other'
}

export function labelForCategory(category: string): string {
  return CATEGORY_LABELS[category] || category
}

export function sortCategories(cats: string[]): string[] {
  const rank = new Map(CATEGORY_ORDER.map((c, i) => [c, i]))
  return [...cats].sort((a, b) => {
    const ra = rank.get(a as (typeof CATEGORY_ORDER)[number])
    const rb = rank.get(b as (typeof CATEGORY_ORDER)[number])
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return a.localeCompare(b)
  })
}
