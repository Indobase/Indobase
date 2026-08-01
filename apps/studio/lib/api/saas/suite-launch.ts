import type { JwtPayload } from '@indobaseinc/indobase-js'

import { getProductLaunchRedirect, type HandoffPayload } from './product-handoff'
import {
  isSuiteModuleId,
  type SuiteModuleId,
  suiteProjectKeyForProjectRef,
  suiteTeamKeyForOrgSlug,
} from './suite-launch-shared'

export {
  isSuiteModuleId,
  isSuiteRole,
  isSuiteRoleDeniedMessage,
  SUITE_ALLOWED_ROLES,
  SUITE_MODULE_IDS,
  SUITE_MODULES,
  SUITE_ROLE_DENIED_CODE,
  suiteProjectKeyForProjectRef,
  suiteTeamKeyForOrgSlug,
  type SuiteModuleId,
  type SuiteModuleMeta,
  type SuiteRole,
} from './suite-launch-shared'

type Claims = JwtPayload & Record<string, unknown>

export type SuiteHandoffPayload = HandoffPayload & { aud: 'indobase-suite' }

export async function getSuiteLaunchRedirect({
  claims,
  ref,
  module,
}: {
  claims: Claims
  ref: string
  module?: string | null
}) {
  const response = await getProductLaunchRedirect('suite', { claims, ref })

  let url = response.url
  if (module && isSuiteModuleId(module) && module !== 'mail') {
    const parsed = new URL(url)
    parsed.searchParams.set('module', module)
    url = parsed.toString()
  }

  return {
    ...response,
    url,
    suiteTeamKey: suiteTeamKeyForOrgSlug(response.project.organization_slug),
    suiteProjectKey: suiteProjectKeyForProjectRef(response.project.ref),
    module: module && isSuiteModuleId(module) ? module : undefined,
  }
}
