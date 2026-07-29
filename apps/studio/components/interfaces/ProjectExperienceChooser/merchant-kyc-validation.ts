import type { MerchantBusinessType } from 'lib/api/saas/merchant-kyc-types'

export type KycFieldKey =
  | 'business_legal_name'
  | 'business_trade_name'
  | 'business_type'
  | 'pan'
  | 'gstin'
  | 'business_address_line1'
  | 'business_address_line2'
  | 'business_city'
  | 'business_state'
  | 'business_postal_code'
  | 'contact_email'
  | 'contact_phone'
  | 'bank_account_holder_name'
  | 'bank_account_number'
  | 'bank_ifsc'
  | 'bank_name'

export type KycFieldErrors = Partial<Record<KycFieldKey, string>>

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PIN_RE = /^[1-9][0-9]{5}$/

export const KYC_FIELD_ATTRS: Partial<
  Record<
    KycFieldKey,
    {
      pattern?: string
      maxLength?: number
      inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'search' | 'none' | 'url' | 'decimal'
      autoComplete?: string
    }
  >
> = {
  pan: { pattern: '[A-Z]{5}[0-9]{4}[A-Z]', maxLength: 10, inputMode: 'text', autoComplete: 'off' },
  gstin: {
    pattern: '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]',
    maxLength: 15,
    inputMode: 'text',
    autoComplete: 'off',
  },
  business_postal_code: {
    pattern: '[1-9][0-9]{5}',
    maxLength: 6,
    inputMode: 'numeric',
    autoComplete: 'postal-code',
  },
  contact_email: { inputMode: 'email', autoComplete: 'email' },
  contact_phone: { maxLength: 15, inputMode: 'tel', autoComplete: 'tel' },
  bank_account_number: { maxLength: 18, inputMode: 'numeric', autoComplete: 'off' },
  bank_ifsc: {
    pattern: '[A-Z]{4}0[A-Z0-9]{6}',
    maxLength: 11,
    inputMode: 'text',
    autoComplete: 'off',
  },
  business_legal_name: { autoComplete: 'organization' },
  bank_account_holder_name: { autoComplete: 'name' },
  business_address_line1: { autoComplete: 'address-line1' },
  business_address_line2: { autoComplete: 'address-line2' },
  business_city: { autoComplete: 'address-level2' },
  business_state: { autoComplete: 'address-level1' },
}

type ValidateInput = {
  business_legal_name: string
  business_type: MerchantBusinessType | ''
  pan: string
  gstin: string
  business_address_line1: string
  business_city: string
  business_state: string
  business_postal_code: string
  contact_email: string
  contact_phone: string
  bank_account_holder_name: string
  bank_account_number: string
  bank_ifsc: string
  panRequired?: boolean
  bankAccountRequired?: boolean
}

export function validateKycFields(input: ValidateInput): KycFieldErrors {
  const errors: KycFieldErrors = {}

  if (!input.business_legal_name.trim()) {
    errors.business_legal_name = 'Legal business name is required'
  }
  if (!input.business_type) {
    errors.business_type = 'Select a business type'
  }
  if (input.panRequired && !input.pan.trim()) {
    errors.pan = 'PAN is required'
  } else if (input.pan.trim() && !PAN_RE.test(input.pan.trim())) {
    errors.pan = 'PAN must be in format ABCDE1234F'
  }
  if (input.gstin.trim() && !GSTIN_RE.test(input.gstin.trim())) {
    errors.gstin = 'GSTIN must be 15 characters (e.g. 22AAAAA0000A1Z5)'
  }
  if (!input.business_address_line1.trim()) {
    errors.business_address_line1 = 'Address line 1 is required'
  }
  if (!input.business_city.trim()) {
    errors.business_city = 'City is required'
  }
  if (!input.business_state.trim()) {
    errors.business_state = 'State is required'
  }
  if (input.business_postal_code.trim() && !PIN_RE.test(input.business_postal_code.trim())) {
    errors.business_postal_code = 'Enter a valid 6-digit postal code'
  }
  if (!input.contact_email.trim()) {
    errors.contact_email = 'Contact email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact_email.trim())) {
    errors.contact_email = 'Enter a valid email address'
  }
  if (!input.contact_phone.trim()) {
    errors.contact_phone = 'Contact phone is required'
  }
  if (!input.bank_account_holder_name.trim()) {
    errors.bank_account_holder_name = 'Account holder name is required'
  }
  if (input.bankAccountRequired && !input.bank_account_number.trim()) {
    errors.bank_account_number = 'Account number is required'
  }
  if (!input.bank_ifsc.trim()) {
    errors.bank_ifsc = 'IFSC is required'
  } else if (!IFSC_RE.test(input.bank_ifsc.trim())) {
    errors.bank_ifsc = 'IFSC must be in format ABCD0123456'
  }

  return errors
}

export function kycErrorId(field: KycFieldKey): string {
  return `kyc-error-${field}`
}
