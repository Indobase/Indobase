/** Shared Canva-like category labels for Design home + editor. */
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
  resume: 'Resumes',
  'business-card': 'Business cards',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  ads: 'Ads',
  marketing: 'Marketing',
  education: 'Education',
  brand: 'Brand',
}

/** Preferred left-rail / home tab order (Canva-like). */
export const CATEGORY_ORDER = [
  'presentation',
  'social',
  'instagram',
  'story',
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
  'resume',
  'education',
  'brand',
] as const

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
