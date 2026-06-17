/**
 * DPDP Act (India) — shared legal/contact constants for Indobase surfaces.
 * Override via env on the Studio server where noted.
 */

export const INDOBASE_LEGAL_ENTITY =
  process.env.INDOBASE_LEGAL_ENTITY_NAME ?? 'Indobase Code Pvt. Ltd.'

export const INDOBASE_PRIVACY_EMAIL =
  process.env.INDOBASE_PRIVACY_EMAIL ?? 'privacy@indobase.in'

export const INDOBASE_DPDP_GRIEVANCE_OFFICER_NAME =
  process.env.INDOBASE_DPDP_GRIEVANCE_OFFICER_NAME ?? 'Data Protection Officer'

export const INDOBASE_DPDP_GRIEVANCE_EMAIL =
  process.env.INDOBASE_DPDP_GRIEVANCE_EMAIL ?? 'grievance@indobase.in'

/** Working days for grievance acknowledgement / resolution targets (operational SLA). */
export const INDOBASE_DPDP_GRIEVANCE_ACK_DAYS = 7
export const INDOBASE_DPDP_GRIEVANCE_RESOLVE_DAYS = 30

/** Control-plane personal data retention after account closure (days). */
export const INDOBASE_DPDP_CONTROL_PLANE_RETENTION_DAYS = 30

export const INDOBASE_DPDP_POLICY_URL = 'https://indobase.in/privacy'
export const INDOBASE_DPDP_NOTICE_URL = 'https://indobase.in/dpdp'
export const INDOBASE_TERMS_URL = 'https://indobase.in/terms'

export type DataPrincipalRequestType =
  | 'access'
  | 'correction'
  | 'erasure'
  | 'grievance'
  | 'nominate'
  | 'consent_withdrawal'

export type DataPrincipalConsentType =
  | 'signup_privacy'
  | 'signup_terms'
  | 'marketing_telemetry'
