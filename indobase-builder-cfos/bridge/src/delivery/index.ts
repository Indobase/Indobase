/**
 * Application Delivery — ecommerce ApplicationContract + verifiers + release gate.
 */

export {
  ECOMMERCE_APPLICATION_CONTRACT,
  ECOMMERCE_CONTRACT_VERSION,
  contractAppliesToAppType,
  resolveApplicationContract,
  resolveContractAppType,
  type ApplicationCapability,
  type ApplicationCapabilityId,
  type ApplicationContract,
  type EcommerceApplicationContract,
} from './application-contract.js'

export {
  ECOMMERCE_OPTIONAL_VERIFIER_IDS,
  ECOMMERCE_REQUIRED_VERIFIER_IDS,
  requiredVerifiersFailed,
  runEcommerceStaticVerifiers,
  runEcommerceVerifiers,
  verifyCheckoutProbeLive,
  type EcommerceRequiredVerifierId,
  type EcommerceVerifierInput,
  type VerifierResult,
  type VerifierSeverity,
} from './ecommerce-verifiers.js'

export {
  assertEcommerceReleaseGate,
  assertEcommerceReleaseGateAsync,
  buildReleaseManifest,
  shouldRunEcommerceReleaseGate,
  type ReleaseFailureNode,
  type ReleaseGateFail,
  type ReleaseGateInput,
  type ReleaseGatePass,
  type ReleaseGateResult,
  type ReleaseManifest,
} from './release-gate.js'

export {
  clearReleaseManifestsForTests,
  getReleaseManifest,
  rememberReleaseManifest,
} from './release-manifest-store.js'
