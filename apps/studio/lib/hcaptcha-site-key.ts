/** Returns a trimmed hCaptcha site key or undefined when unset/blank. */
export function resolveHcaptchaSiteKey(
  runtimeKey?: string | null
): string | undefined {
  const injected =
    typeof window !== 'undefined'
      ? window.__INDOBASE_PUBLIC_ENV__?.hcaptchaSiteKey
      : undefined

  const candidates = [
    runtimeKey,
    injected,
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY : undefined,
    typeof process !== 'undefined' ? process.env.HCAPTCHA_SITE_KEY : undefined,
  ]

  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed) return trimmed
  }

  return undefined
}
