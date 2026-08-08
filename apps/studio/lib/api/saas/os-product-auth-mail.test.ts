import { describe, expect, it } from 'vitest'

import {
  AUTH_LOGIN_MAIL_NEXT_STEP,
  parseOsProductMail,
  resolveProductMailerFromIdentity,
  statusMessageForProductMail,
  validateProductFromEmail,
} from './os-product-auth-mail-core'

describe('os-product-auth-mail', () => {
  it('parses os_product_mail slice', () => {
    expect(
      parseOsProductMail({
        os_product_mail: { mode: 'branded', from_email: 'hello@acme.in', from_name: 'Acme' },
      }),
    ).toEqual({
      mode: 'branded',
      from_email: 'hello@acme.in',
      from_name: 'Acme',
    })
  })

  it('validates from email', () => {
    expect(validateProductFromEmail('Ada@Acme.IN').ok).toBe(true)
    expect(validateProductFromEmail('nope').ok).toBe(false)
  })

  it('brands From from os_product_mail', () => {
    const r = resolveProductMailerFromIdentity({
      os_product_mail: { mode: 'branded', from_email: 'otp@shop.in', from_name: 'Shop' },
    })
    expect(r.smtpAdminEmail).toBe('otp@shop.in')
    expect(r.smtpSenderName).toBe('Shop')
    expect(r.branded).toBe(true)
  })

  it('uses Studio SMTP form From when os_product_mail absent', () => {
    const r = resolveProductMailerFromIdentity({
      SMTP_ADMIN_EMAIL: 'noreply@brand.com',
      SMTP_SENDER_NAME: 'Brand',
    })
    expect(r.smtpAdminEmail).toBe('noreply@brand.com')
    expect(r.smtpSenderName).toBe('Brand')
    expect(r.mode).toBe('branded')
  })

  it('indobase mode resets to fleet defaults', () => {
    const r = resolveProductMailerFromIdentity({
      os_product_mail: { mode: 'indobase' },
      SMTP_ADMIN_EMAIL: 'ignored@x.com',
    })
    expect(r.mode).toBe('indobase')
    expect(r.branded).toBe(false)
    expect(r.smtpAdminEmail).toMatch(/@/)
  })

  it('exposes next_step copy for ensure(auth)', () => {
    expect(AUTH_LOGIN_MAIL_NEXT_STEP.path).toBe('/api/os/auth/mail')
    expect(statusMessageForProductMail({
      mode: 'branded',
      from_email: 'a@b.com',
      from_name: 'A',
      branded: true,
      default_from_email: 'auth@indobase.in',
      default_from_name: 'Indobase',
    })).toMatch(/A <a@b.com>/)
  })
})
