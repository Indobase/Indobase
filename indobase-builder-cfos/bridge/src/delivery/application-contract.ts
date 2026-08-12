/**
 * ApplicationContract — machine-owned definition of done for Application Delivery.
 * Ecommerce is the reference shell; do not expand to booking/SaaS here.
 */

import {
  collectLaunchText,
  inferAppTypeFromContent,
} from '../wire-proof.js'
import {
  normalizeLaunchAppType,
  type LaunchAppType,
} from '../launch-backend-gate.js'

export const ECOMMERCE_CONTRACT_VERSION = 'ecommerce-contract/v1' as const

export type ApplicationCapabilityId =
  | 'product_catalogue'
  | 'cart'
  | 'checkout_commerce_abi'
  | 'inventory_reservations'
  | 'admin_orders'
  | 'payments_byok'

export type ApplicationCapability = {
  id: ApplicationCapabilityId
  required: boolean
  description: string
}

export type EcommerceApplicationContract = {
  applicationType: 'ecommerce'
  version: typeof ECOMMERCE_CONTRACT_VERSION
  capabilities: ApplicationCapability[]
}

export type ApplicationContract = EcommerceApplicationContract

/** Ecommerce ApplicationContract v1 — reference Application Delivery shell. */
export const ECOMMERCE_APPLICATION_CONTRACT: EcommerceApplicationContract = {
  applicationType: 'ecommerce',
  version: ECOMMERCE_CONTRACT_VERSION,
  capabilities: [
    {
      id: 'product_catalogue',
      required: true,
      description: 'Product catalogue readable by storefront (public_read_admin_write).',
    },
    {
      id: 'cart',
      required: true,
      description: 'Client cart UX; authoritative totals come from CheckoutService.',
    },
    {
      id: 'checkout_commerce_abi',
      required: true,
      description: 'Checkout via Commerce ABI (window.indobase.commerce / /api/os/commerce).',
    },
    {
      id: 'inventory_reservations',
      required: true,
      description: 'Inventory holds via CheckoutService (admin-only reservations collection).',
    },
    {
      id: 'admin_orders',
      required: true,
      description: 'Orders managed via admin / CheckoutService — not public PocketBase creates.',
    },
    {
      id: 'payments_byok',
      required: false,
      description: 'Payments optional BYOK (Razorpay/Stripe) — not required to Go Live.',
    },
  ],
}

export function resolveApplicationContract(input: {
  app_type?: string | null
  html?: string | null
  files?: Record<string, string> | null
}): ApplicationContract | null {
  const appType = resolveContractAppType(input)
  if (appType === 'ecommerce') return ECOMMERCE_APPLICATION_CONTRACT
  return null
}

export function resolveContractAppType(input: {
  app_type?: string | null
  html?: string | null
  files?: Record<string, string> | null
}): LaunchAppType {
  if (input.app_type?.trim()) {
    return normalizeLaunchAppType(input.app_type)
  }
  const text = collectLaunchText({ html: input.html, files: input.files })
  const inferred = inferAppTypeFromContent(text)
  if (inferred) return normalizeLaunchAppType(inferred)
  return 'landing'
}

export function contractAppliesToAppType(appType: LaunchAppType): boolean {
  return appType === 'ecommerce'
}
