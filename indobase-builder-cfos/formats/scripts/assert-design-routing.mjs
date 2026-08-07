#!/usr/bin/env node
/**
 * Assert Design format routing keyword → format.design mapping.
 * Mirrors packages/cloudflare-adapter/src/design-format-routing.ts (keep in sync).
 */
import assert from 'node:assert/strict'

const DESIGN = 'format.design'

const KEYWORDS = [
  'logo',
  'logotype',
  'wordmark',
  'brand mark',
  'instagram',
  'insta post',
  'ig post',
  'ig story',
  'linkedin post',
  'facebook post',
  'social post',
  'social media',
  'story',
  'stories',
  'poster',
  'flyer',
  'flier',
  'banner',
  'graphic design',
  'graphic',
  'creative',
  'creatives',
  'thumbnail',
  'cover image',
  'square post',
  'carousel cover',
]

function looksLikeDesign(prompt) {
  const text = String(prompt || '').toLowerCase()
  return KEYWORDS.some((kw) => text.includes(kw))
}

function preferred(prompt) {
  return looksLikeDesign(prompt) ? DESIGN : null
}

const mustDesign = [
  'Make me a logo for Indobase',
  'Design an Instagram post about our launch',
  'LinkedIn post graphic for hiring',
  'Facebook post creative',
  'IG story for the sale',
  'Poster for the meetup',
  'Flyer for the open house',
  'Banner for the website hero',
  'Graphic design for our brand',
  'Create a creative for social media',
  'Thumbnail for YouTube',
  'Cover image for LinkedIn',
]

const mustNot = [
  'Write a project proposal document',
  'Build a spreadsheet of expenses',
  'Create a 10-slide pitch deck',
  'Add a login page with React',
]

let failed = 0
for (const p of mustDesign) {
  try {
    assert.equal(preferred(p), DESIGN, p)
    console.log(`  ok  → ${DESIGN}: ${p}`)
  } catch (e) {
    console.error(`  FAIL ${e.message}`)
    failed++
  }
}
for (const p of mustNot) {
  try {
    assert.equal(preferred(p), null, p)
    console.log(`  ok  → (none): ${p}`)
  } catch (e) {
    console.error(`  FAIL ${e.message}`)
    failed++
  }
}

if (failed) {
  console.error(`\n${failed} design-routing assertion(s) failed`)
  process.exit(1)
}
console.log('\nDesign routing keyword map OK.')
