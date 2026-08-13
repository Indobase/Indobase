/**
 * Production ApplicationContract — definition of done for launch jobs.
 * Ecommerce capabilities stay aligned with delivery/application-contract.ts.
 */

import { ECOMMERCE_APPLICATION_CONTRACT } from '../delivery/application-contract.js'
import type { ProductionAppType } from './application-planner.js'

export const LANDING_CONTRACT_VERSION = 'landing-contract/v1' as const
export const SAAS_CONTRACT_VERSION = 'saas-contract/v1' as const

export type ProductionCapability = {
  id: string
  required: boolean
  description: string
}

export type ProductionApplicationContract = {
  applicationType: ProductionAppType
  production: true
  version: string
  capabilities: ProductionCapability[]
  requiredFlows: string[]
}

export const LANDING_APPLICATION_CONTRACT: ProductionApplicationContract = {
  applicationType: 'landing',
  production: true,
  version: LANDING_CONTRACT_VERSION,
  capabilities: [
    { id: 'public_site', required: true, description: 'Public marketing page on Indobase hosting.' },
    { id: 'seo_basics', required: true, description: 'Title + meta description.' },
    { id: 'legal_links', required: true, description: 'Privacy and Terms links.' },
  ],
  requiredFlows: ['homepage'],
}

export const SAAS_APPLICATION_CONTRACT: ProductionApplicationContract = {
  applicationType: 'saas',
  production: true,
  version: SAAS_CONTRACT_VERSION,
  capabilities: [
    { id: 'auth', required: true, description: 'Customer login (OTP) against Indobase auth.' },
    { id: 'database', required: true, description: 'Provisioned records API + starter schema.' },
    { id: 'user_profile', required: true, description: 'Signed-in identity visible in the app.' },
    { id: 'crud_foundation', required: true, description: 'Authenticated create/list of a core entity.' },
    { id: 'frontend_runtime', required: true, description: 'UI bound to session.backend (no localStorage auth).' },
  ],
  requiredFlows: ['signup', 'login', 'create_record', 'list_records', 'logout'],
}

export function resolveProductionContract(appType: ProductionAppType): ProductionApplicationContract {
  if (appType === 'ecommerce') {
    return {
      applicationType: 'ecommerce',
      production: true,
      version: ECOMMERCE_APPLICATION_CONTRACT.version,
      capabilities: ECOMMERCE_APPLICATION_CONTRACT.capabilities.map((c) => ({
        id: c.id,
        required: c.required,
        description: c.description,
      })),
      requiredFlows: ['browse_catalog', 'add_to_cart', 'checkout', 'order_created'],
    }
  }
  if (appType === 'saas') return SAAS_APPLICATION_CONTRACT
  return LANDING_APPLICATION_CONTRACT
}
