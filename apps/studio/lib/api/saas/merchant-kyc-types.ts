/**
 * Shared Indobase Payments merchant KYC types (safe for Studio client + server).
 */

export type MerchantKycStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'rejected'

export type MerchantBusinessType =
  | 'individual'
  | 'proprietorship'
  | 'partnership'
  | 'private_limited'
  | 'public_limited'
  | 'llp'
  | 'trust'
  | 'other'

export type MerchantDocumentMeta = {
  id: string
  kind: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  uploaded_at: string
}

export type MerchantProfilePublic = {
  id: string
  project_ref: string
  organization_id: number
  kyc_status: MerchantKycStatus
  kyc_rejection_reason: string | null
  submitted_at: string | null
  reviewed_at: string | null
  verified_at: string | null
  business_legal_name: string | null
  business_trade_name: string | null
  business_type: MerchantBusinessType | null
  /** Masked PAN (e.g. ABCDE****F) — never full value in API responses. */
  pan_masked: string | null
  gstin: string | null
  business_address_line1: string | null
  business_address_line2: string | null
  business_city: string | null
  business_state: string | null
  business_postal_code: string | null
  business_country: string
  contact_email: string | null
  contact_phone: string | null
  bank_account_holder_name: string | null
  /** Masked account — last4 only. */
  bank_account_masked: string | null
  bank_account_last4: string | null
  bank_ifsc: string | null
  bank_name: string | null
  documents: MerchantDocumentMeta[]
  aggregator_provider: string
  aggregator_account_id: string | null
  aggregator_status: string | null
  /** Soft-gate helpers for Studio UI. */
  can_browse_payments: boolean
  can_go_live: boolean
  inserted_at: string
  updated_at: string
}

export type MerchantProfilePatch = {
  business_legal_name?: string | null
  business_trade_name?: string | null
  business_type?: MerchantBusinessType | null
  pan?: string | null
  gstin?: string | null
  business_address_line1?: string | null
  business_address_line2?: string | null
  business_city?: string | null
  business_state?: string | null
  business_postal_code?: string | null
  business_country?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  bank_account_holder_name?: string | null
  /** Full account number — encrypted at rest; never returned. */
  bank_account_number?: string | null
  bank_ifsc?: string | null
  bank_name?: string | null
  /** Replace document metadata list (upload bytes are out of scope). */
  documents?: MerchantDocumentMeta[] | null
}
