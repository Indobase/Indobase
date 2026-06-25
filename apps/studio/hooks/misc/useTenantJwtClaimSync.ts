import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'

import { gotrueClient, useAuth, useIsLoggedIn } from 'common'
import { fetchPost } from 'data/fetchers'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { BASE_PATH } from 'lib/constants'
import { scheduleIdleWork } from 'lib/scheduleIdleWork'
import { saasOrganizationIdToTenantUuid } from 'lib/saas-organization-tenant-uuid'
import { ResponseError } from 'types'

function routeNeedsTenantJwtClaim(pathname: string) {
  return pathname.startsWith('/org/') || pathname.startsWith('/project/')
}

/**
 * Keeps GoTrue `app_metadata.tenant_id` aligned with the selected SaaS organization
 * so JWTs used toward Postgres include a tenant claim for `public.current_tenant_id()`.
 */
export function useTenantJwtClaimSync() {
  const router = useRouter()
  const isLoggedIn = useIsLoggedIn()
  const { refreshSession } = useAuth()
  const { data: org } = useSelectedOrganizationQuery()
  const failSlugRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoggedIn || !org?.slug || !routeNeedsTenantJwtClaim(router.pathname)) {
      failSlugRef.current = null
      return
    }

    let cancelled = false

    scheduleIdleWork(() => {
      if (cancelled) return

      void (async () => {
        const expected = saasOrganizationIdToTenantUuid(org.id)
        const {
          data: { session },
        } = await gotrueClient.getSession()
        const current = session?.user?.app_metadata?.tenant_id
        if (current === expected) {
          failSlugRef.current = null
          return
        }

        if (failSlugRef.current === org.slug) {
          return
        }

        const url = `${BASE_PATH}/api/platform/profile/sync-tenant-claim`
        const res = await fetchPost<{ tenant_id: string; skipped: boolean }>(url, {
          organizationSlug: org.slug,
        })

        if (cancelled) return

        if (res instanceof ResponseError) {
          failSlugRef.current = org.slug
          return
        }

        failSlugRef.current = null
        await refreshSession()
      })()
    })

    return () => {
      cancelled = true
    }
  }, [isLoggedIn, org?.id, org?.slug, refreshSession, router.pathname])
}
