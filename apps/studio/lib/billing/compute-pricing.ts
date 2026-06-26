import { IS_SAAS } from 'lib/constants'
import { formatCurrency } from 'lib/helpers'

/** Matches public billing plans API (`/api/platform/billing/plans`). */
export const INDOBASE_USD_TO_INR_RATE = 83

export const COMPUTE_CREDIT_USD_MONTHLY = 10

export function shouldShowInrComputePricing(): boolean {
  return IS_SAAS
}

export function usdToInr(usd: number): number {
  return usd * INDOBASE_USD_TO_INR_RATE
}

/** Convert a USD list price to the currency shown in Studio billing UI. */
export function toDisplayCurrencyAmount(usdAmount: number): number {
  return shouldShowInrComputePricing() ? usdToInr(usdAmount) : usdAmount
}

export function formatDisplayCurrencyAmount(usdAmount: number): string | null {
  return formatCurrency(toDisplayCurrencyAmount(usdAmount))
}

export function formatInstancePriceDescription(hourlyUsd: number, monthlyUsd: number): string {
  if (!shouldShowInrComputePricing()) {
    return `$${hourlyUsd}/hour (~$${monthlyUsd}/month)`
  }

  const hourly = formatCurrency(usdToInr(hourlyUsd))
  const monthly = formatCurrency(usdToInr(monthlyUsd))
  return `${hourly}/hour (~${monthly}/month)`
}

export function formatComputeIntervalPrice(
  usdAmount: number,
  interval: 'hour' | 'month'
): string | null {
  const formatted = formatDisplayCurrencyAmount(usdAmount)
  if (!formatted) return null
  return `${formatted}/${interval}`
}
