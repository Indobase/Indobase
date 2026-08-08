import { describe, expect, it } from 'vitest'

import {
  DESIGN_FORMAT_BLUEPRINT_ID,
  DESIGN_FORMAT_ROUTING_RULES,
  STANDARD_FORMAT_AGENT_HINTS,
  inferDesignPresetFromPrompt,
  preferredFormatForPrompt,
  promptLooksLikeDesignIntent,
} from './design-format-routing'

describe('design format routing', () => {
  it('maps logo/social/poster intents to format.design', () => {
    const samples = [
      'Make me a logo for Indobase',
      'Instagram post about our launch',
      'LinkedIn post graphic',
      'Facebook post creative',
      'IG story for the sale',
      'Poster for the meetup',
      'Flyer for open house',
      'Banner for the hero',
      'Graphic design for the brand',
      'Create a creative for social media',
      'Thumbnail cover image',
    ]
    for (const prompt of samples) {
      expect(promptLooksLikeDesignIntent(prompt), prompt).toBe(true)
      expect(preferredFormatForPrompt(prompt), prompt).toBe(DESIGN_FORMAT_BLUEPRINT_ID)
    }
  })

  it('does not force Design for docs/sheets/slides/app intents', () => {
    for (const prompt of [
      'Write a project proposal document',
      'Build a spreadsheet of expenses',
      'Create a 10-slide pitch deck',
      'Add a login page with React',
    ]) {
      expect(preferredFormatForPrompt(prompt), prompt).toBeNull()
    }
  })

  it('infers canvas presets from the prompt', () => {
    expect(inferDesignPresetFromPrompt('logo for acme')).toBe('logo')
    expect(inferDesignPresetFromPrompt('instagram story sale')).toBe('story')
    expect(inferDesignPresetFromPrompt('poster for event')).toBe('poster')
    expect(inferDesignPresetFromPrompt('linkedin post graphic')).toBe('ig-post')
  })

  it('routing rules and admin hints name format.design and forbid Slides misuse', () => {
    expect(DESIGN_FORMAT_ROUTING_RULES).toMatch(/format\.design/)
    expect(DESIGN_FORMAT_ROUTING_RULES).toMatch(/ALWAYS/)
    expect(DESIGN_FORMAT_ROUTING_RULES).toMatch(/NEVER/)
    expect(DESIGN_FORMAT_ROUTING_RULES).toMatch(/Slides/)
    expect(STANDARD_FORMAT_AGENT_HINTS['format.design']).toMatch(/ALWAYS/)
    expect(STANDARD_FORMAT_AGENT_HINTS['format.slides']).toMatch(/NEVER/)
    expect(STANDARD_FORMAT_AGENT_HINTS['format.design'].length).toBeLessThanOrEqual(400)
    expect(STANDARD_FORMAT_AGENT_HINTS['format.slides'].length).toBeLessThanOrEqual(400)
  })
})
