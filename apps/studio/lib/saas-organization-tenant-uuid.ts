import { v5 as uuidv5 } from 'uuid'

/**
 * Fixed namespace for uuid v5 (not a registered OID; internal to Indobase Studio).
 * Changing this breaks equality with existing JWT `tenant_id` values and RLS rows.
 */
export const SAAS_ORG_TENANT_UUID_NAMESPACE = 'f47ac10b-58cc-4372-a567-0e02bdc3d289'

/**
 * Stable UUID for a SaaS organization id — written to GoTrue `app_metadata.tenant_id`
 * so PostgREST / `public.current_tenant_id()` can drive app-table RLS.
 */
export function saasOrganizationIdToTenantUuid(organizationId: number): string {
  return uuidv5(`indobase:saas:organization:${organizationId}`, SAAS_ORG_TENANT_UUID_NAMESPACE)
}
