/** Customer-facing product name (never upstream Postiz / Gitroom in shipped UI). */
export function productNameServerSide(): string {
  return process.env.PRODUCT_NAME?.trim() || 'Indobase Social'
}
