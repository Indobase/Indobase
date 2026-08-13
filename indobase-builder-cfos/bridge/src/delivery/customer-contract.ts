/**
 * Ecommerce Customer Contract v1.1 — identity + ownership.
 * Core v1 (catalogue/cart/checkout/admin) stays frozen.
 */
export {
  CUSTOMER_APPLICATION_CONTRACT,
  CUSTOMER_CONTRACT_VERSION,
  CUSTOMER_INVARIANT_IDS,
  CUSTOMER_SECURITY_BACKLOG,
  evaluateGuestOrderClaim,
  type CustomerInvariantId,
  type GuestClaimResult,
} from '../commerce/customer-identity.js'
