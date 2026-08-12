/** Money helpers — integer minor units only (no float commerce math). */

export function majorToMinor(major: number | string, currency = 'INR'): number {
  const n = typeof major === 'string' ? Number(major) : major
  if (!Number.isFinite(n)) return 0
  const zeros = currencyMinorDigits(currency)
  return Math.round(n * 10 ** zeros)
}

export function minorToMajor(minor: number, currency = 'INR'): number {
  const zeros = currencyMinorDigits(currency)
  return minor / 10 ** zeros
}

export function currencyMinorDigits(currency: string): number {
  const c = (currency || 'INR').toUpperCase()
  // Most ISO currencies use 2; JPY/KRW use 0. INR uses 2 (paise).
  if (c === 'JPY' || c === 'KRW' || c === 'VND') return 0
  return 2
}

export function formatMinor(minor: number, currency = 'INR'): string {
  const major = minorToMajor(minor, currency)
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(major)
  } catch {
    return `${currency} ${major}`
  }
}
