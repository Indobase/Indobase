/**
 * Mint HS256 room tokens for the self-hosted Meet engine (Prosody JWT auth).
 * Customer chrome never names the engine.
 */
import { createHmac } from 'node:crypto'

import type { Session } from './auth.js'
import { displayNameFromEmail } from './auth.js'

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function engineJwtConfigured(): boolean {
  const id = (process.env.JWT_APP_ID || process.env.MEET_JWT_APP_ID || '').trim()
  const secret = (process.env.JWT_APP_SECRET || process.env.MEET_JWT_APP_SECRET || '').trim()
  return id.length > 0 && secret.length >= 16
}

export function mintEngineRoomJwt(opts: {
  roomName: string
  session: Session
  subject: string
  ttlSeconds?: number
}): string | null {
  const appId = (process.env.JWT_APP_ID || process.env.MEET_JWT_APP_ID || '').trim()
  const appSecret = (process.env.JWT_APP_SECRET || process.env.MEET_JWT_APP_SECRET || '').trim()
  if (!appId || appSecret.length < 16) return null

  const now = Math.floor(Date.now() / 1000)
  const ttl = opts.ttlSeconds ?? 60 * 60 * 4
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64urlEncode(
    JSON.stringify({
      aud: appId,
      iss: appId,
      sub: opts.subject,
      room: opts.roomName,
      nbf: now - 10,
      exp: now + ttl,
      context: {
        user: {
          id: opts.session.gotrueId,
          name: displayNameFromEmail(opts.session.email),
          email: opts.session.email,
          moderator: opts.session.isModerator,
        },
        features: {
          livestreaming: false,
          recording: false,
          transcription: false,
          'outbound-call': false,
        },
      },
    })
  )
  const sig = createHmac('sha256', appSecret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64urlEncode(sig)}`
}

export const MEET_PRODUCT_NAME = 'Indobase Meet'
export const MEET_BRAND_BLUE = '#3B8FD6'

export function meetInterfaceConfig(brandLogoUrl: string): Record<string, unknown> {
  return {
    APP_NAME: MEET_PRODUCT_NAME,
    NATIVE_APP_NAME: MEET_PRODUCT_NAME,
    PROVIDER_NAME: 'Indobase',
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
    SHOW_BRAND_WATERMARK: false,
    SHOW_POWERED_BY: false,
    DEFAULT_LOGO_URL: brandLogoUrl,
    DEFAULT_WELCOME_PAGE_LOGO_URL: brandLogoUrl,
    DISPLAY_WELCOME_FOOTER: false,
    MOBILE_APP_PROMO: false,
    HIDE_INVITE_MORE_HEADER: true,
  }
}

export function meetConfigOverwrite(subject: string): Record<string, unknown> {
  return {
    prejoinPageEnabled: true,
    disableDeepLinking: true,
    enableWelcomePage: false,
    enableClosePage: false,
    defaultLanguage: 'en',
    subject,
    hideConferenceSubject: false,
    toolbarButtons: [
      'microphone',
      'camera',
      'desktop',
      'chat',
      'raisehand',
      'participants-pane',
      'tileview',
      'toggle-camera',
      'hangup',
      'settings',
      'fullscreen',
    ],
  }
}
