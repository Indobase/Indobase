import { Check, ChevronLeft, ChevronRight, FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  useMerchantProfileSubmitMutation,
  useMerchantProfileUpdateMutation,
} from 'data/payments/merchant-profile-mutation'
import type {
  MerchantBusinessType,
  MerchantDocumentMeta,
  MerchantProfilePublic,
} from 'lib/api/saas/merchant-kyc-types'
import {
  Button,
  Input,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  cn,
} from 'ui'

import {
  KYC_FIELD_ATTRS,
  type KycFieldErrors,
  type KycFieldKey,
  kycErrorId,
  validateKycFields,
} from './merchant-kyc-validation'

const STEPS = [
  { id: 'business', label: 'Business' },
  { id: 'bank', label: 'Bank account' },
  { id: 'documents', label: 'Documents' },
  { id: 'review', label: 'Review' },
] as const

type StepId = (typeof STEPS)[number]['id']

const BUSINESS_TYPE_OPTIONS: { value: MerchantBusinessType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'proprietorship', label: 'Sole proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'private_limited', label: 'Private limited' },
  { value: 'public_limited', label: 'Public limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'trust', label: 'Trust / society' },
  { value: 'other', label: 'Other' },
]

const DOCUMENT_KINDS = [
  { value: 'pan_card', label: 'PAN card' },
  { value: 'gst_certificate', label: 'GST certificate' },
  { value: 'cancelled_cheque', label: 'Cancelled cheque' },
  { value: 'business_registration', label: 'Business registration' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'other', label: 'Other' },
]

type FormState = {
  business_legal_name: string
  business_trade_name: string
  business_type: MerchantBusinessType | ''
  pan: string
  gstin: string
  business_address_line1: string
  business_address_line2: string
  business_city: string
  business_state: string
  business_postal_code: string
  contact_email: string
  contact_phone: string
  bank_account_holder_name: string
  bank_account_number: string
  bank_ifsc: string
  bank_name: string
  documents: MerchantDocumentMeta[]
}

function formFromProfile(merchant: MerchantProfilePublic): FormState {
  return {
    business_legal_name: merchant.business_legal_name || '',
    business_trade_name: merchant.business_trade_name || '',
    business_type: merchant.business_type || '',
    pan: '',
    gstin: merchant.gstin || '',
    business_address_line1: merchant.business_address_line1 || '',
    business_address_line2: merchant.business_address_line2 || '',
    business_city: merchant.business_city || '',
    business_state: merchant.business_state || '',
    business_postal_code: merchant.business_postal_code || '',
    contact_email: merchant.contact_email || '',
    contact_phone: merchant.contact_phone || '',
    bank_account_holder_name: merchant.bank_account_holder_name || '',
    bank_account_number: '',
    bank_ifsc: merchant.bank_ifsc || '',
    bank_name: merchant.bank_name || '',
    documents: merchant.documents || [],
  }
}

type MerchantKycOnboardingProps = {
  projectRef: string
  merchant: MerchantProfilePublic
  readOnly?: boolean
}

export function MerchantKycOnboarding({
  projectRef,
  merchant,
  readOnly = false,
}: MerchantKycOnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<FormState>(() => formFromProfile(merchant))
  const [docKind, setDocKind] = useState('pan_card')
  const [docFileName, setDocFileName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<KycFieldErrors>({})

  const updateMutation = useMerchantProfileUpdateMutation()
  const submitMutation = useMerchantProfileSubmitMutation()

  const panRequired = !merchant.pan_masked
  const bankAccountRequired = !merchant.bank_account_masked

  const validationInput = {
    business_legal_name: form.business_legal_name,
    business_type: form.business_type,
    pan: form.pan,
    gstin: form.gstin,
    business_address_line1: form.business_address_line1,
    business_city: form.business_city,
    business_state: form.business_state,
    business_postal_code: form.business_postal_code,
    contact_email: form.contact_email,
    contact_phone: form.contact_phone,
    bank_account_holder_name: form.bank_account_holder_name,
    bank_account_number: form.bank_account_number,
    bank_ifsc: form.bank_ifsc,
    panRequired,
    bankAccountRequired,
  }

  const validateStep = (stepId: StepId): boolean => {
    const all = validateKycFields(validationInput)
    const keysForStep: Record<StepId, KycFieldKey[]> = {
      business: [
        'business_legal_name',
        'business_type',
        'pan',
        'gstin',
        'business_address_line1',
        'business_city',
        'business_state',
        'business_postal_code',
        'contact_email',
        'contact_phone',
      ],
      bank: ['bank_account_holder_name', 'bank_account_number', 'bank_ifsc', 'bank_name'],
      documents: [],
      review: [],
    }
    const nextErrors: KycFieldErrors = {}
    for (const key of keysForStep[stepId]) {
      if (all[key]) nextErrors[key] = all[key]
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const clearFieldError = (key: KycFieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const kycInputProps = (field: KycFieldKey) => ({
    id: field,
    error: fieldErrors[field],
    ...KYC_FIELD_ATTRS[field],
  })

  useEffect(() => {
    setForm(formFromProfile(merchant))
  }, [merchant.id, merchant.updated_at])

  const step = STEPS[stepIndex]
  const editable = !readOnly && (merchant.kyc_status === 'draft' || merchant.kyc_status === 'rejected')
  const saving = updateMutation.isPending || submitMutation.isPending

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key in fieldErrors) clearFieldError(key as KycFieldKey)
  }

  const saveBusiness = async () => {
    if (!editable) return
    await updateMutation.mutateAsync({
      projectRef,
      patch: {
        business_legal_name: form.business_legal_name,
        business_trade_name: form.business_trade_name,
        business_type: form.business_type || null,
        ...(form.pan.trim() ? { pan: form.pan } : {}),
        gstin: form.gstin,
        business_address_line1: form.business_address_line1,
        business_address_line2: form.business_address_line2,
        business_city: form.business_city,
        business_state: form.business_state,
        business_postal_code: form.business_postal_code,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        business_country: 'IN',
      },
    })
    toast.success('Business details saved')
  }

  const saveBank = async () => {
    if (!editable) return
    await updateMutation.mutateAsync({
      projectRef,
      patch: {
        bank_account_holder_name: form.bank_account_holder_name,
        ...(form.bank_account_number.trim()
          ? { bank_account_number: form.bank_account_number }
          : {}),
        bank_ifsc: form.bank_ifsc,
        bank_name: form.bank_name,
      },
    })
    toast.success('Bank details saved')
  }

  const saveDocuments = async (docs: MerchantDocumentMeta[]) => {
    if (!editable) return
    await updateMutation.mutateAsync({
      projectRef,
      patch: { documents: docs },
    })
    setForm((prev) => ({ ...prev, documents: docs }))
    toast.success('Documents updated')
  }

  const goNext = async () => {
    try {
      if (editable && !validateStep(step.id)) return
      if (editable) {
        if (step.id === 'business') await saveBusiness()
        if (step.id === 'bank') await saveBank()
      }
      if (stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1)
    } catch {
      // toast handled by mutation
    }
  }

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1)
  }

  const addDocument = async () => {
    const name = docFileName.trim()
    if (!name) {
      toast.error('Enter a file name for the document metadata')
      return
    }
    const next: MerchantDocumentMeta[] = [
      ...form.documents,
      {
        id: crypto.randomUUID(),
        kind: docKind,
        file_name: name,
        content_type: null,
        size_bytes: null,
        uploaded_at: new Date().toISOString(),
      },
    ]
    setDocFileName('')
    try {
      await saveDocuments(next)
    } catch {
      // toast handled
    }
  }

  const removeDocument = async (id: string) => {
    const next = form.documents.filter((d) => d.id !== id)
    try {
      await saveDocuments(next)
    } catch {
      // toast handled
    }
  }

  const submit = async () => {
    try {
      if (editable) {
        const businessOk = validateStep('business')
        const bankOk = validateStep('bank')
        if (!businessOk || !bankOk) {
          setStepIndex(!businessOk ? 0 : 1)
          return
        }
        await saveBusiness()
        await saveBank()
        if (form.documents.length) {
          await updateMutation.mutateAsync({
            projectRef,
            patch: { documents: form.documents },
          })
        }
      }
      await submitMutation.mutateAsync({ projectRef })
      toast.success('Merchant KYC submitted for review')
    } catch {
      // toast handled
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-medium text-foreground">Merchant onboarding</h2>
        <p className="mt-1 text-sm text-foreground-light">
          Verify your business for Indobase Payments. Settlements go to your own bank account via
          the licensed aggregator — Indobase does not take custody of funds.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, index) => {
          const active = index === stepIndex
          const done = index < stepIndex
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={saving}
                aria-label={`Go to step ${index + 1}: ${s.label}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 min-h-[44px] text-xs transition',
                  active && 'border-brand bg-brand/10 text-foreground',
                  done && !active && 'border-foreground-muted text-foreground-light',
                  !active && !done && 'border-border text-foreground-lighter'
                )}
              >
                {done ? <Check size={12} /> : <span>{index + 1}</span>}
                {s.label}
              </button>
            </li>
          )
        })}
      </ol>

      {merchant.kyc_status === 'rejected' && merchant.kyc_rejection_reason ? (
        <div className="rounded-md border border-destructive-400 bg-destructive-200/20 px-3 py-2 text-sm text-foreground">
          Previous submission was rejected: {merchant.kyc_rejection_reason}
        </div>
      ) : null}

      {step.id === 'business' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Legal business name"
            value={form.business_legal_name}
            disabled={!editable || saving}
            onChange={(e) => setField('business_legal_name', e.target.value)}
            {...kycInputProps('business_legal_name')}
          />
          <Input
            label="Trade name (optional)"
            value={form.business_trade_name}
            disabled={!editable || saving}
            onChange={(e) => setField('business_trade_name', e.target.value)}
            id="business_trade_name"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm text-foreground-light" htmlFor="business_type">
              Business type
            </label>
            <Select_Shadcn_
              value={form.business_type || undefined}
              disabled={!editable || saving}
              onValueChange={(value) => setField('business_type', value as MerchantBusinessType)}
            >
              <SelectTrigger_Shadcn_
                id="business_type"
                aria-invalid={fieldErrors.business_type ? true : undefined}
                aria-describedby={
                  fieldErrors.business_type ? kycErrorId('business_type') : undefined
                }
              >
                <SelectValue_Shadcn_ placeholder="Select type" />
              </SelectTrigger_Shadcn_>
              <SelectContent_Shadcn_>
                {BUSINESS_TYPE_OPTIONS.map((opt) => (
                  <SelectItem_Shadcn_ key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem_Shadcn_>
                ))}
              </SelectContent_Shadcn_>
            </Select_Shadcn_>
            {fieldErrors.business_type ? (
              <p id={kycErrorId('business_type')} className="text-xs text-destructive" role="alert">
                {fieldErrors.business_type}
              </p>
            ) : null}
          </div>
          <Input
            label={merchant.pan_masked ? `PAN (saved ${merchant.pan_masked})` : 'PAN'}
            placeholder="ABCDE1234F"
            value={form.pan}
            disabled={!editable || saving}
            onChange={(e) => setField('pan', e.target.value.toUpperCase())}
            {...kycInputProps('pan')}
          />
          <Input
            label="GSTIN (optional)"
            value={form.gstin}
            disabled={!editable || saving}
            onChange={(e) => setField('gstin', e.target.value.toUpperCase())}
            {...kycInputProps('gstin')}
          />
          <Input
            label="Contact email"
            type="email"
            value={form.contact_email}
            disabled={!editable || saving}
            onChange={(e) => setField('contact_email', e.target.value)}
            {...kycInputProps('contact_email')}
          />
          <Input
            label="Contact phone"
            value={form.contact_phone}
            disabled={!editable || saving}
            onChange={(e) => setField('contact_phone', e.target.value)}
            className="sm:col-span-2"
            {...kycInputProps('contact_phone')}
          />
          <Input
            label="Address line 1"
            value={form.business_address_line1}
            disabled={!editable || saving}
            onChange={(e) => setField('business_address_line1', e.target.value)}
            className="sm:col-span-2"
            {...kycInputProps('business_address_line1')}
          />
          <Input
            label="Address line 2"
            value={form.business_address_line2}
            disabled={!editable || saving}
            onChange={(e) => setField('business_address_line2', e.target.value)}
            className="sm:col-span-2"
            id="business_address_line2"
            autoComplete="address-line2"
          />
          <Input
            label="City"
            value={form.business_city}
            disabled={!editable || saving}
            onChange={(e) => setField('business_city', e.target.value)}
            {...kycInputProps('business_city')}
          />
          <Input
            label="State"
            value={form.business_state}
            disabled={!editable || saving}
            onChange={(e) => setField('business_state', e.target.value)}
            {...kycInputProps('business_state')}
          />
          <Input
            label="Postal code"
            value={form.business_postal_code}
            disabled={!editable || saving}
            onChange={(e) => setField('business_postal_code', e.target.value)}
            {...kycInputProps('business_postal_code')}
          />
        </div>
      ) : null}

      {step.id === 'bank' ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground-light">
            Payouts settle to this account in your name. Account numbers are encrypted at rest and
            only the last four digits are shown after save.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Account holder name"
              value={form.bank_account_holder_name}
              disabled={!editable || saving}
              onChange={(e) => setField('bank_account_holder_name', e.target.value)}
              className="sm:col-span-2"
              {...kycInputProps('bank_account_holder_name')}
            />
            <Input
              label={
                merchant.bank_account_masked
                  ? `Account number (saved ${merchant.bank_account_masked})`
                  : 'Account number'
              }
              value={form.bank_account_number}
              disabled={!editable || saving}
              onChange={(e) => setField('bank_account_number', e.target.value)}
              placeholder={merchant.bank_account_last4 ? 'Leave blank to keep saved account' : ''}
              {...kycInputProps('bank_account_number')}
            />
            <Input
              label="IFSC"
              value={form.bank_ifsc}
              disabled={!editable || saving}
              onChange={(e) => setField('bank_ifsc', e.target.value.toUpperCase())}
              placeholder="ABCD0123456"
              {...kycInputProps('bank_ifsc')}
            />
            <Input
              label="Bank name"
              value={form.bank_name}
              disabled={!editable || saving}
              onChange={(e) => setField('bank_name', e.target.value)}
              className="sm:col-span-2"
              id="bank_name"
            />
          </div>
        </div>
      ) : null}

      {step.id === 'documents' ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground-light">
            Record document metadata for review. File storage upload lands with the aggregator
            connector; for now, list what you will provide (PAN, cancelled cheque, registration).
          </p>
          {editable ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex min-w-[10rem] flex-col gap-1">
                <label className="text-sm text-foreground-light">Document type</label>
                <Select_Shadcn_ value={docKind} onValueChange={setDocKind} disabled={saving}>
                  <SelectTrigger_Shadcn_>
                    <SelectValue_Shadcn_ />
                  </SelectTrigger_Shadcn_>
                  <SelectContent_Shadcn_>
                    {DOCUMENT_KINDS.map((opt) => (
                      <SelectItem_Shadcn_ key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem_Shadcn_>
                    ))}
                  </SelectContent_Shadcn_>
                </Select_Shadcn_>
              </div>
              <Input
                label="File name"
                value={docFileName}
                disabled={saving}
                onChange={(e) => setDocFileName(e.target.value)}
                placeholder="pan-card.pdf"
                className="flex-1"
              />
              <Button type="default" icon={<Plus size={14} />} disabled={saving} onClick={addDocument}>
                Add
              </Button>
            </div>
          ) : null}
          <ul className="divide-y rounded-md border border-border">
            {form.documents.length === 0 ? (
              <li className="px-3 py-4 text-sm text-foreground-lighter">No documents listed yet</li>
            ) : (
              form.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={14} className="shrink-0 text-foreground-light" />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{doc.file_name}</p>
                      <p className="text-xs text-foreground-lighter">{doc.kind}</p>
                    </div>
                  </div>
                  {editable ? (
                    <Button
                      type="text"
                      size="tiny"
                      icon={<Trash2 size={14} />}
                      disabled={saving}
                      onClick={() => removeDocument(doc.id)}
                    />
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {step.id === 'review' ? (
        <div className="space-y-3 rounded-md border border-border p-4 text-sm">
          <ReviewRow label="Legal name" value={form.business_legal_name || merchant.business_legal_name} />
          <ReviewRow label="Business type" value={form.business_type || merchant.business_type} />
          <ReviewRow label="PAN" value={merchant.pan_masked || (form.pan ? 'Will save on submit' : '—')} />
          <ReviewRow label="GSTIN" value={form.gstin || merchant.gstin || '—'} />
          <ReviewRow
            label="Bank"
            value={
              form.bank_account_holder_name || merchant.bank_account_holder_name
                ? `${form.bank_account_holder_name || merchant.bank_account_holder_name} · ${
                    merchant.bank_account_masked ||
                    (form.bank_account_number ? `••••${form.bank_account_number.slice(-4)}` : '—')
                  } · ${form.bank_ifsc || merchant.bank_ifsc || '—'}`
                : '—'
            }
          />
          <ReviewRow
            label="Documents"
            value={
              form.documents.length
                ? form.documents.map((d) => d.file_name).join(', ')
                : 'None listed'
            }
          />
          <ReviewRow
            label="Aggregator account"
            value={merchant.aggregator_account_id || 'Assigned on submit (stub until Razorpay Route)'}
          />
          <p className="pt-2 text-xs text-foreground-lighter">
            By submitting, you confirm the details are accurate. Indobase Payments orchestrates
            billing; money settles to your merchant account through the licensed aggregator. This
            is not legal advice.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="default"
          icon={<ChevronLeft size={14} />}
          disabled={stepIndex === 0 || saving}
          onClick={goBack}
        >
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          {step.id !== 'review' ? (
            <Button
              type="primary"
              iconRight={saving ? <Loader2 className="animate-spin" size={14} /> : <ChevronRight size={14} />}
              disabled={saving}
              onClick={goNext}
            >
              {editable ? 'Save & continue' : 'Continue'}
            </Button>
          ) : (
            <Button
              type="primary"
              disabled={!editable || saving}
              loading={submitMutation.isPending}
              onClick={submit}
            >
              Submit for review
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-36 shrink-0 text-foreground-lighter">{label}</dt>
      <dd className="text-foreground">{value || '—'}</dd>
    </div>
  )
}
