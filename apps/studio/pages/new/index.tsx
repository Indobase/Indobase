import HCaptcha from '@hcaptcha/react-hcaptcha'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { NewOrgForm } from 'components/interfaces/Organization/NewOrg/NewOrgForm'
import AppLayout from 'components/layouts/AppLayout/AppLayout'
import DefaultLayout from 'components/layouts/DefaultLayout'
import WizardLayout from 'components/layouts/WizardLayout'
import { SetupIntentResponse, useSetupIntent } from 'data/stripe/setup-intent-mutation'
import { isRazorpayBillingClient } from 'lib/constants'
import type { NextPageWithLayout } from 'types'

/**
 * No org selected yet, create a new one
 */
const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() ?? ''

const Wizard: NextPageWithLayout = () => {
  const [intent, setIntent] = useState<SetupIntentResponse>()

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRef, setCaptchaRef] = useState<HCaptcha | null>(null)

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const captchaEnabled = hcaptchaSiteKey.length > 0 && !isRazorpayBillingClient

  const { mutate: setupIntent } = useSetupIntent({ onSuccess: (res) => setIntent(res) })

  const captchaRefCallback = useCallback((node: any) => {
    setCaptchaRef(node)
  }, [])

  const initSetupIntent = async (hcaptchaToken: string | undefined) => {
    if (!hcaptchaToken) return console.error('Hcaptcha token is required')

    // Force a reload of Elements, necessary for Stripe
    // Also mitigates card testing to some extent as we generate a new captcha token
    setIntent(undefined)
    setupIntent({ hcaptchaToken })
  }

  const loadPaymentForm = async (force = false) => {
    if (selectedPlan == null || selectedPlan === 'FREE') return
    if (intent != null && !force) return
    if (!captchaEnabled) return

    if (captchaRef) {
      let token = captchaToken

      try {
        if (!token) {
          const captchaResponse = await captchaRef.execute({ async: true })
          token = captchaResponse?.response ?? null
        }
      } catch (error) {
        return
      }

      await initSetupIntent(token ?? undefined)
      resetCaptcha()
    }
  }

  useEffect(() => {
    loadPaymentForm()
  }, [captchaRef, selectedPlan, captchaEnabled])

  const resetSetupIntent = () => {
    setIntent(undefined)
    return loadPaymentForm(true)
  }

  const onLocalCancel = () => {
    setIntent(undefined)
  }

  const resetCaptcha = () => {
    setCaptchaToken(null)
    captchaRef?.resetCaptcha()
  }

  const captchaNotice = useMemo(() => {
    if (isRazorpayBillingClient || captchaEnabled || selectedPlan == null || selectedPlan === 'FREE')
      return null
    return (
      <p className="mb-4 text-sm text-warning">
        Paid plans require hCaptcha, but NEXT_PUBLIC_HCAPTCHA_SITE_KEY is not configured on this
        Studio instance. Choose the Free plan or contact your administrator.
      </p>
    )
  }, [captchaEnabled, selectedPlan])

  return (
    <>
      {captchaNotice}
      {captchaEnabled && (
        <HCaptcha
          ref={captchaRefCallback}
          sitekey={hcaptchaSiteKey}
          size="invisible"
          onVerify={(token) => {
            setCaptchaToken(token)
          }}
          onClose={onLocalCancel}
          onExpire={() => {
            setCaptchaToken(null)
          }}
        />
      )}

      <NewOrgForm
        setupIntent={intent}
        onPaymentMethodReset={() => resetSetupIntent()}
        onPlanSelected={(plan) => setSelectedPlan(plan)}
      />
    </>
  )
}

Wizard.getLayout = (page) => (
  <AppLayout>
    <DefaultLayout headerTitle="New organization">
      <WizardLayout>{page}</WizardLayout>
    </DefaultLayout>
  </AppLayout>
)

export default Wizard
