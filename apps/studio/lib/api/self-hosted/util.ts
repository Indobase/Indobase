import crypto from 'crypto-js'
import { IS_PLATFORM } from 'lib/constants'
import {
  ENCRYPTION_KEY,
  POSTGRES_DATABASE,
  POSTGRES_HOST,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_USER_READ_WRITE,
  POSTGRES_USER_READ_ONLY,
} from './constants'

/**
 * Asserts that the current environment is self-hosted.
 */
export function assertSelfHosted() {
  if (IS_PLATFORM) {
    throw new Error(
      'Self-hosted platform SQL is disabled because NEXT_PUBLIC_IS_PLATFORM=true. ' +
        'For docker/self-hosted Studio, unset it or set NEXT_PUBLIC_IS_PLATFORM=false so ' +
        'STUDIO_PG_META_URL and POSTGRES_* can be used for /api/platform/*.'
    )
  }
}

export function encryptString(stringToEncrypt: string): string {
  return crypto.AES.encrypt(stringToEncrypt, ENCRYPTION_KEY).toString()
}

/** Percent-encode user/password for PostgreSQL URIs (@ : / etc. must not break the URI). */
function encodePgUriUserInfo(value: string) {
  return encodeURIComponent(value)
}

export function getConnectionString({ readOnly }: { readOnly: boolean }) {
  const postgresUser = readOnly ? POSTGRES_USER_READ_ONLY : POSTGRES_USER_READ_WRITE

  const user = encodePgUriUserInfo(postgresUser)
  const pass = encodePgUriUserInfo(POSTGRES_PASSWORD)

  return `postgresql://${user}:${pass}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`
}
