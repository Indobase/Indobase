import HCaptcha from '@hcaptcha/react-hcaptcha'
import { zodResolver } from '@hookform/resolvers/zod'
import type { AuthError } from 'indobase-js'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { type SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import z from 'zod'

import { useAddLoginEvent } from 'data/misc/audit-login-mutation'
import { getMfaAuthenticatorAssuranceLevel } from 'data/profile/mfa-authenticator-assurance-level-query'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useLastSignIn } from 'hooks/misc/useLastSignIn'
import { captureCriticalError } from 'lib/error-reporting'
import { IS_SAAS } from 'lib/constants'
import { auth, buildPathWithParams, getReturnToPath } from 'lib/gotrue'
import { Button, Form_Shadcn_, FormControl_Shadcn_, FormField_Shadcn_, Input_Shadcn_ } from 'ui'
import { Admonition } from 'ui-patterns/admonition'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'

import { Eye, EyeOff } from 'lucide-react'

import { LastSignInWrapper } from './LastSignInWrapper'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Must be a valid email'),
  password: z.string().min(1, 'Password is required'),
})

const formId = 'sign-in-form'

const hcaptchaSiteKey =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY : undefined

export const SignInForm = () => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [_, setLastSignIn] = useLastSignIn()

  const [passwordHidden, setPasswordHidden] = useState(true)

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<HCaptcha>(null)
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const { setValue } = form
  const isSubmitting = form.formState.isSubmitting

  useEffect(() => {
    setReturnTo(getReturnToPath())
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const raw = router.query.email
    const emailFromQuery = Array.isArray(raw) ? raw[0] : raw
    if (typeof emailFromQuery === 'string' && emailFromQuery.length > 0) {
      setValue('email', emailFromQuery)
    }
  }, [router.isReady, router.query.email, setValue])

  const { mutate: sendEvent } = useSendEventMutation()
  const { mutate: addLoginEvent } = useAddLoginEvent()

  let forgotPasswordUrl = `/forgot-password`

  if (returnTo && !returnTo.includes('/forgot-password')) {
    forgotPasswordUrl = `${forgotPasswordUrl}?returnTo=${encodeURIComponent(returnTo)}`
  }

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = async ({ email, password }) => {
    const toastId = toast.loading('Signing in...')

    let token = captchaToken
    if (hcaptchaSiteKey && !token) {
      const captchaResponse = await captchaRef.current?.execute({ async: true })
      token = captchaResponse?.response ?? null
    }

    const { error } = await auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: token ?? undefined },
    })

    if (!error) {
      setLastSignIn('email')
      try {
        const data = await getMfaAuthenticatorAssuranceLevel()
        if (data) {
          if (data.currentLevel !== data.nextLevel) {
            toast.success(`You need to provide your second factor authentication`, { id: toastId })
            const url = buildPathWithParams('/sign-in-mfa')
            router.replace(url)
            return
          }
        }

        toast.success(`Signed in successfully!`, { id: toastId })
        sendEvent({
          action: 'sign_in',
          properties: { category: 'account', method: 'email' },
        })
        addLoginEvent({})

        await queryClient.resetQueries()

        let redirectPath = '/organizations'
        if (returnTo && returnTo !== '/sign-in') {
          redirectPath = returnTo
        }

        router.push(redirectPath)
      } catch (error: any) {
        toast.error(`Failed to sign in: ${(error as AuthError).message}`, { id: toastId })
        captureCriticalError(error, 'sign in via EP')
      }
    } else {
      setCaptchaToken(null)
      captchaRef.current?.resetCaptcha()

      if (error.message.toLowerCase() === 'email not confirmed') {
        return toast.error(
          'Account has not been verified, please check the link sent to your email',
          { id: toastId }
        )
      }

      const invalidCredentials =
        error.message.toLowerCase().includes('invalid login credentials') ||
        error.code === 'invalid_credentials'

      if (invalidCredentials) {
        form.setError('password', {
          type: 'manual',
          message: 'Email or password is incorrect. Check your details and try again.',
        })
        return toast.error('Email or password is incorrect', { id: toastId })
      }

      toast.error(error.message, { id: toastId })
    }
  }

  const showPendingConfirmationHint = !IS_SAAS && router.query.pendingConfirmation === '1'

  return (
    <Form_Shadcn_ {...form}>
      <form id={formId} className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        {showPendingConfirmationHint && (
          <Admonition
            type="default"
            title="Confirm your email"
            description="We sent a link to your inbox. After you confirm, sign in below — your email is already filled in."
          />
        )}

        <FormField_Shadcn_
          key="email"
          name="email"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout name="email" label="Email">
              <FormControl_Shadcn_>
                <Input_Shadcn_
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...field}
                  placeholder="you@example.com"
                  disabled={isSubmitting}
                />
              </FormControl_Shadcn_>
            </FormItemLayout>
          )}
        />

        <div className="relative">
          <FormField_Shadcn_
            key="password"
            name="password"
            control={form.control}
            render={({ field }) => (
              <FormItemLayout name="password" label="Password">
                <FormControl_Shadcn_>
                  <div className="relative">
                    <Input_Shadcn_
                      id="password"
                      type={passwordHidden ? 'password' : 'text'}
                      autoComplete="current-password"
                      {...field}
                      placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                      disabled={isSubmitting}
                      className="pr-10"
                    />
                    <Button
                      type="default"
                      title={passwordHidden ? `Show password` : `Hide password`}
                      aria-label={passwordHidden ? `Show password` : `Hide password`}
                      className="absolute right-1 top-1 px-1.5"
                      icon={passwordHidden ? <Eye /> : <EyeOff />}
                      disabled={isSubmitting}
                      onClick={() => setPasswordHidden((prev) => !prev)}
                    />
                  </div>
                </FormControl_Shadcn_>
              </FormItemLayout>
            )}
          />

          <Link href={forgotPasswordUrl} className="absolute top-0 right-0 text-sm text-foreground-lighter">
            Forgot password?
          </Link>
        </div>

        {hcaptchaSiteKey ? (
          <div className="self-center">
            <HCaptcha
              ref={captchaRef}
              sitekey={hcaptchaSiteKey}
              size="invisible"
              onVerify={(token) => {
                setCaptchaToken(token)
              }}
              onExpire={() => {
                setCaptchaToken(null)
              }}
            />
          </div>
        ) : null}

        <LastSignInWrapper type="email">
          <Button
            block
            form={formId}
            htmlType="submit"
            size="large"
            type="warning"
            loading={isSubmitting}
          >
            Sign in
          </Button>
        </LastSignInWrapper>
      </form>
    </Form_Shadcn_>
  )
}
