import { AWS_REGIONS } from 'shared-data'

import { BASE_PATH } from 'lib/constants'
import { INDIA_REGION_DEFAULT, INDIA_REGIONS } from 'lib/constants/india-regions'

export type RegionDisplay = {
  name: string
  region: string
  key?: string
}

const INDIA_BY_CODE = Object.fromEntries(
  Object.values(INDIA_REGIONS).map((r) => [r.code, r])
)

const INDIA_BY_DISPLAY = Object.fromEntries(
  Object.values(INDIA_REGIONS).map((r) => [r.displayName.toLowerCase(), r.code])
)

/** Stable SVG slug under public/img/regions — never returns undefined. */
export function resolveRegionIconCode(region?: string | null): string {
  const raw = region?.trim()
  if (!raw) return INDIA_REGION_DEFAULT.code

  if (INDIA_BY_CODE[raw]) return raw

  const awsExact = Object.values(AWS_REGIONS).find((r) => r.code === raw)
  if (awsExact) return awsExact.code

  const byDisplay = INDIA_BY_DISPLAY[raw.toLowerCase()]
  if (byDisplay) return byDisplay

  const indiaPartial = Object.values(INDIA_REGIONS).find(
    (r) =>
      raw.includes(r.code) ||
      raw.toLowerCase().includes(r.displayName.toLowerCase()) ||
      r.displayName.toLowerCase().includes(raw.toLowerCase())
  )
  if (indiaPartial) return indiaPartial.code

  const awsPartial = Object.values(AWS_REGIONS).find(
    (r) =>
      raw.includes(r.code) ||
      raw.toLowerCase().includes(r.displayName.toLowerCase()) ||
      r.displayName.toLowerCase().includes(raw.toLowerCase())
  )
  if (awsPartial) return awsPartial.code

  return INDIA_REGION_DEFAULT.code
}

export function regionIconSrc(region?: string | null): string {
  return `${BASE_PATH}/img/regions/${resolveRegionIconCode(region)}.svg`
}

/** Map tenant region strings (e.g. in-chennai, "Chennai") to diagram node metadata. */
export function resolveRegionDisplay(region?: string | null): RegionDisplay {
  const code = resolveRegionIconCode(region)
  const india = INDIA_BY_CODE[code]
  if (india) return { name: india.displayName, region: india.code }

  const aws = Object.values(AWS_REGIONS).find((r) => r.code === code)
  if (aws) return { name: aws.displayName, region: aws.code }

  const raw = region?.trim()
  return { name: raw || INDIA_REGION_DEFAULT.displayName, region: code }
}
