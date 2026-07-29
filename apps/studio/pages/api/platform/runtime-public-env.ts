import type { NextApiRequest, NextApiResponse } from 'next'

import {
  resolvePublicGotrueUrlForBrowser,
  resolveServerPublicAnonKey,
  resolveServerPublicBuilderAppUrl,
  resolveServerPublicSiteUrl,
} from 'common/public-env'

/**
 * Runtime public auth/config for browser clients. Uses server env
 * instead of build-time NEXT_PUBLIC_* values that may still carry demo keys
 * or production SITE_URL bake-ins on staging images.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const anonKey = resolveServerPublicAnonKey()
  const gotrueUrl = resolvePublicGotrueUrlForBrowser()
  const siteUrl = resolveServerPublicSiteUrl()
  const builderAppUrl = resolveServerPublicBuilderAppUrl()
  const hcaptchaSiteKey =
    process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() ||
    process.env.HCAPTCHA_SITE_KEY?.trim() ||
    undefined

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ...(anonKey ? { anonKey } : {}),
    ...(gotrueUrl ? { gotrueUrl } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    ...(builderAppUrl ? { builderAppUrl } : {}),
    ...(hcaptchaSiteKey ? { hcaptchaSiteKey } : {}),
  })
}
