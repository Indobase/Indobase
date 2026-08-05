import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from 'App'
import { initPaymentsSentry } from '@/lib/sentry'

import '@/styles/main.css'
import 'react-loading-skeleton/dist/skeleton.css'
import 'sonner/dist/styles.css'

initPaymentsSentry()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
