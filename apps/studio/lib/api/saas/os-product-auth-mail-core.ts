/**
 * Pure product Auth mail helpers (no Studio/platform imports — vitest-friendly).
 */
export const OS_PRODUCT_MAIL_KEY = 'os_product_mail' as const

export type OsProductMailMode = 'indobase' | 'branded'

export type OsProductMailConfig = {
  mode: OsProductMailMode
  from_email?: string
  from_name?: string
  updated_at?: string
}

export type OsProductMailStatus = {
  mode: OsProductMailMode
  from_email: string
  from_name: string
  branded: boolean
  default_from_email: string
  default_from_name: string
  message: string
}

export const AUTH_LOGIN_MAIL_NEXT_STEP = {
  id: 'product_mail',
  label:
    'Login emails use Indobase mail. Optionally set your From name or address via POST /api/os/auth/mail.',
  path: '/api/os/auth/mail',
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function fleetDefaultFromEmail(): string {
  return (
    process.env.SAAS_TENANT_SMTP_ADMIN_EMAIL?.trim() ||
    process.env.SMTP_ADMIN_EMAIL?.trim() ||
    'auth@indobase.in'
  )
}

export function fleetDefaultFromName(): string {
  return (
    process.env.SAAS_TENANT_SMTP_SENDER_NAME?.trim() ||
    process.env.SMTP_SENDER_NAME?.trim() ||
    'Indobase'
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function parseOsProductMail(authConfig: unknown): OsProductMailConfig | null {
  const root = asRecord(authConfig)
  if (!root) return null
  const raw = asRecord(root[OS_PRODUCT_MAIL_KEY])
  if (!raw) return null
  const mode = raw.mode === 'branded' ? 'branded' : raw.mode === 'indobase' ? 'indobase' : null
  if (!mode) return null
  const from_email = typeof raw.from_email === 'string' ? raw.from_email.trim() : undefined
  const from_name = typeof raw.from_name === 'string' ? raw.from_name.trim() : undefined
  return {
    mode,
    ...(from_email ? { from_email } : {}),
    ...(from_name ? { from_name } : {}),
    ...(typeof raw.updated_at === 'string' ? { updated_at: raw.updated_at } : {}),
  }
}

export function validateProductFromEmail(
  email: string,
): { ok: true; email: string } | { ok: false; message: string } {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return { ok: false, message: 'from_email is required when branding login mail.' }
  if (!EMAIL_RE.test(trimmed)) return { ok: false, message: 'from_email must be a valid email address.' }
  if (trimmed.length > 254) return { ok: false, message: 'from_email is too long.' }
  return { ok: true, email: trimmed }
}

/**
 * Resolve live GOTRUE From identity: os_product_mail → Studio SMTP_* form fields → fleet defaults.
 * Host/user/pass always remain fleet (not applied from custom SMTP in v1).
 */
export function resolveProductMailerFromIdentity(authConfig: unknown): {
  smtpAdminEmail: string
  smtpSenderName: string
  mode: OsProductMailMode
  branded: boolean
} {
  const defaults = {
    smtpAdminEmail: fleetDefaultFromEmail(),
    smtpSenderName: fleetDefaultFromName(),
  }
  const product = parseOsProductMail(authConfig)
  const root = asRecord(authConfig)

  if (product?.mode === 'indobase') {
    return { ...defaults, mode: 'indobase', branded: false }
  }

  if (product?.mode === 'branded') {
    const email = product.from_email?.trim() || defaults.smtpAdminEmail
    const name = product.from_name?.trim() || defaults.smtpSenderName
    return {
      smtpAdminEmail: email,
      smtpSenderName: name,
      mode: 'branded',
      branded:
        email.toLowerCase() !== defaults.smtpAdminEmail.toLowerCase() ||
        name !== defaults.smtpSenderName,
    }
  }

  const formEmail = typeof root?.SMTP_ADMIN_EMAIL === 'string' ? root.SMTP_ADMIN_EMAIL.trim() : ''
  const formName = typeof root?.SMTP_SENDER_NAME === 'string' ? root.SMTP_SENDER_NAME.trim() : ''
  if (formEmail || formName) {
    const email = formEmail || defaults.smtpAdminEmail
    const name = formName || defaults.smtpSenderName
    return {
      smtpAdminEmail: email,
      smtpSenderName: name,
      mode: 'branded',
      branded: true,
    }
  }

  return { ...defaults, mode: 'indobase', branded: false }
}

export function statusMessageForProductMail(status: Omit<OsProductMailStatus, 'message'>): string {
  if (!status.branded || status.mode === 'indobase') {
    return 'Login emails use Indobase mail. You can set a custom From name or address anytime.'
  }
  return `Login emails will send from ${status.from_name} <${status.from_email}>.`
}

export function asAuthConfigRecord(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {}
}
