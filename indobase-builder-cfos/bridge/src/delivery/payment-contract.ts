/**
 * Ecommerce Payment Contract v1.2 — state machine, not a PSP integration.
 * Core v1 and V1.1 stay frozen.
 */
export {
  PAYMENT_APPLICATION_CONTRACT,
  PAYMENT_CONTRACT_VERSION,
  PAYMENT_INVARIANT_IDS,
  applyPaymentEvent,
  type PaymentInvariantId,
  type PaymentState,
} from '../commerce/payment-machine.js'
