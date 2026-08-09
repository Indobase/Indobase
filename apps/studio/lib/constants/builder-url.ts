/**
 * Public Builder URL for Studio UI CTAs (Builder-first OS).
 * Prefer NEXT_PUBLIC_BUILDER_APP_URL; default production host.
 */
export function getPublicBuilderUrl(): string {
  const raw =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BUILDER_APP_URL?.trim()) ||
    'https://builder.indobase.in'
  return raw.replace(/\/+$/, '')
}
