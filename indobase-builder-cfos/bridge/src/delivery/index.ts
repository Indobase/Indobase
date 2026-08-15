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
  ECOMMERCE_CERT_CORPUS,
  type EcommerceCertStore,
} from './ecommerce-cert-corpus.js'
export {
  ECOMMERCE_CERT_VERSION,
  certifyStore,
  formatEcommerceCertReport,
  runEcommerceCertification,
  type CertCheck,
  type EcommerceCertReport,
  type StoreCertResult,
} from './ecommerce-certification.js'
export {
  CUSTOMER_APPLICATION_CONTRACT,
  CUSTOMER_CONTRACT_VERSION,
  CUSTOMER_INVARIANT_IDS,
} from './customer-contract.js'
export {
  CUSTOMER_CERT_VERSION,
  certifyCustomerPlatform,
  certifyCustomerStorefront,
  runCustomerCertification,
} from './customer-certification.js'
export {
  PAYMENT_APPLICATION_CONTRACT,
  PAYMENT_CONTRACT_VERSION,
  PAYMENT_INVARIANT_IDS,
} from './payment-contract.js'
export {
  PAYMENT_CERT_VERSION,
  certifyPaymentStateMachine,
  runPaymentCertification,
} from './payment-certification.js'
export {
  ECOMMERCE_FUNCTIONAL_VERIFIER_IDS,
  requiredFunctionalVerifiersFailed,
  runEcommerceFunctionalVerifiers,
  shouldRequireEcommerceFunctionalVerifiers,
  type EcommerceFunctionalVerifierId,
  type EcommerceFunctionalVerifierInput,
  type FunctionalFetch,
} from './ecommerce-functional-verifiers.js'

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

export {
  ECOMMERCE_TASK_GRAPH_VERSION,
  ECOMMERCE_TASK_IDS,
  GUIDED_STEP_TO_TASK,
  applyGuidedStepsToTaskGraph,
  applyLaunchGateToTaskGraph,
  buildEcommerceTaskGraph,
  cloneTaskGraph,
  getTask,
  markTask,
  summarizeTaskGraph,
  taskGraphDependenciesSatisfied,
  type EcommerceTask,
  type EcommerceTaskGraph,
  type EcommerceTaskGraphSummary,
  type EcommerceTaskId,
  type EcommerceTaskStatus,
} from './task-graph.js'
