import { describe, expect, it } from 'vitest'

import {
  resolveDiscussUploadMimeType,
  sanitizeDiscussFileName,
} from './discuss-upload'

describe('sanitizeDiscussFileName', () => {
  it('strips unsafe characters', () => {
    expect(sanitizeDiscussFileName('  hello world!!.png  ')).toBe('hello_world_.png')
  })
})

describe('resolveDiscussUploadMimeType', () => {
  it('keeps allowlisted browser types', () => {
    expect(resolveDiscussUploadMimeType({ name: 'a.png', type: 'image/png' })).toBe('image/png')
  })

  it('maps extension when type is empty', () => {
    expect(resolveDiscussUploadMimeType({ name: 'notes.PDF', type: '' })).toBe('application/pdf')
  })

  it('normalizes image/jpg', () => {
    expect(resolveDiscussUploadMimeType({ name: 'a.jpg', type: 'image/jpg' })).toBe('image/jpeg')
  })

  it('rejects unknown types instead of octet-stream', () => {
    expect(() =>
      resolveDiscussUploadMimeType({ name: 'photo.heic', type: 'image/heic' })
    ).toThrow(/not an allowed file type/)
  })
})
