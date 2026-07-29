declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

let razorpayLoadPromise: Promise<void> | null = null

export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (razorpayLoadPromise) return razorpayLoadPromise

  razorpayLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'))
    document.head.appendChild(script)
  })

  return razorpayLoadPromise
}

export type RazorpayCheckoutInput = {
  keyId: string
  orderId: string
  amount: number
  currency: string
  name: string
  description: string
  prefill?: { email?: string; name?: string }
}

export type RazorpaySuccess = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export async function openRazorpayCheckout(
  input: RazorpayCheckoutInput
): Promise<RazorpaySuccess> {
  await loadRazorpayCheckout()
  if (!window.Razorpay) throw new Error('Razorpay Checkout unavailable')

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: input.keyId,
      amount: input.amount,
      currency: input.currency,
      name: input.name,
      description: input.description,
      order_id: input.orderId,
      prefill: input.prefill,
      theme: { color: '#3B8FD6' },
      handler: (response: RazorpaySuccess) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error('Checkout closed')),
      },
    })
    checkout.open()
  })
}
