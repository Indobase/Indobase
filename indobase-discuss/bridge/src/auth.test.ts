import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hasFrappeSessionCookies } from './auth.js'

describe('hasFrappeSessionCookies', () => {
  it('requires both sid and a non-Guest user_id', () => {
    assert.equal(hasFrappeSessionCookies(undefined), false)
    assert.equal(hasFrappeSessionCookies('indobase_discuss_session=abc'), false)
    assert.equal(hasFrappeSessionCookies('sid=abc; user_id=Guest'), false)
    assert.equal(hasFrappeSessionCookies('sid=abc; user_id=hi%40adral.fun'), true)
    assert.equal(hasFrappeSessionCookies('sid=abc; user_id=hi@adral.fun'), true)
  })
})
