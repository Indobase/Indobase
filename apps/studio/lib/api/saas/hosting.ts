import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getCustomDomain, type CustomDomainApiResponse } from './custom-domains'
import { ensureSaasTables, getGotrueUserId } from './platform'
import { executeQuery } from './query'
import { getStudioOrigin } from './builder-launch'
import { resolveSaaSTenantApiBaseUrl } from './tenant-public-urls'
import { decryptString } from './util'

type Claims = JwtPayload & Record<string, unknown>

export type ProjectHostingMetadata = {
  project: {
    name: string
    organization_slug: string
    ref: string
  }
  hosting: {
    active_url: string
    api_url: string
    custom_domain: {
      configured: boolean
      hostname: string | null
      status: string
      url: string | null
      verification_errors: string[]
    }
    default_url: string
    manage_url: string
    mode: 'managed_subdomain'
    settings_url: string
    uses_dedicated_subdomain: boolean
  }
  studio: {
    general_settings_url: string
    hosting_url: string
    origin: string
    project_url: string
  }
}

function mapCustomDomain(customDomain: CustomDomainApiResponse | null) {
  if (!customDomain) {
    return {
      configured: false,
      hostname: null,
      status: '0_no_hostname_configured',
      url: null,
      verification_errors: [],
    }
  }

  const hostname = customDomain.custom_hostname?.trim() || customDomain.data.result.hostname?.trim() || null

  return {
    configured: Boolean(hostname),
    hostname,
    status: customDomain.status,
    url: hostname ? `https://${hostname}` : null,
    verification_errors: customDomain.data.result.verification_errors ?? [],
  }
}

export async function getProjectHostingForRef({
  claims,
  ref,
}: {
  claims: Claims
  ref: string
}): Promise<ProjectHostingMetadata | null> {
  await ensureSaasTables()
  const gotrueId = getGotrueUserId(claims)
  const row = await executeQuery<{
    connection_string: string | null
    connection_string_enc: string | null
    name: string
    organization_slug: string
    ref: string
  }>({
    query: `
      select
        p.ref,
        p.name,
        p.organization_slug,
        p.connection_string,
        p.connection_string_enc
      from saas.projects p
      join saas.organization_members m on m.organization_id = p.organization_id
      where p.ref = $1 and m.gotrue_id = $2
      limit 1
    `,
    parameters: [ref, gotrueId],
    actorId: gotrueId,
  })
  if (row.error) throw row.error
  if (!row.data?.length) return null

  const project = row.data[0]
  const tenantDbUrl =
    project.connection_string_enc?.trim() ? decryptString(project.connection_string_enc) : project.connection_string
  const usesDedicatedSubdomain = Boolean(tenantDbUrl?.trim())
  const defaultUrl = resolveSaaSTenantApiBaseUrl(ref, usesDedicatedSubdomain)
  const customDomain = mapCustomDomain(await getCustomDomain({ claims, ref }))
  const studioOrigin = getStudioOrigin().replace(/\/+$/, '')
  const hostingUrl = `${studioOrigin}/project/${ref}/settings/general#hosting`
  const settingsUrl = `${studioOrigin}/project/${ref}/settings/general`

  return {
    project: {
      name: project.name,
      organization_slug: project.organization_slug,
      ref: project.ref,
    },
    hosting: {
      active_url: customDomain.url ?? defaultUrl,
      api_url: defaultUrl,
      custom_domain: customDomain,
      default_url: defaultUrl,
      manage_url: hostingUrl,
      mode: 'managed_subdomain',
      settings_url: settingsUrl,
      uses_dedicated_subdomain: usesDedicatedSubdomain,
    },
    studio: {
      general_settings_url: settingsUrl,
      hosting_url: hostingUrl,
      origin: studioOrigin,
      project_url: `${studioOrigin}/project/${ref}`,
    },
  }
}
