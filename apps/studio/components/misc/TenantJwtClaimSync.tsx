import { useTenantJwtClaimSync } from 'hooks/misc/useTenantJwtClaimSync'

/** No UI; runs JWT tenant claim sync for the selected organization. */
export function TenantJwtClaimSync() {
  useTenantJwtClaimSync()
  return null
}
