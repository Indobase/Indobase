import HCaptcha from '@hcaptcha/react-hcaptcha'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { CheckCircle, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { parseAsString, useQueryStates } from 'nuqs'
import { useRef, useState } from 'react'
import { SubmitHandler, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import z from 'zod'

import { useSignUpMutation } from 'data/misc/signup-mutation'
import { BASE_PATH } from 'lib/constants'
import { INDOBASE_DPDP_POLICY_URL, INDOBASE_TERMS_URL } from 'common'
import { auth, buildPathWithParams } from 'lib/gotrue'
import {
  AlertDescription_Shadcn_,
  AlertTitle_Shadcn_,
  Alert_Shadcn_,
  Button,
  Checkbox_Shadcn_,
  FormControl_Shadcn_,
  FormField_Shadcn_,
  Form_Shadcn_,
  Input_Shadcn_,
  cn,
} from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import PasswordConditionsHelper from './PasswordConditionsHelper'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Must be a valid email'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(72, 'Password cannot exceed 72 characters')
    .refine((password) => password.length >= 8, 'Password must be at least 8 characters')
    .refine(
      (password) => /[A-Z]/.test(password),
      'Password must contain at least 1 uppercase character'
    )
    .refine(
      (password) => /[a-z]/.test(password),
      'Password must contain at least 1 lowercase character'
    )
    .refine((password) => /[0-9]/.test(password), 'Password must contain at least 1 number')
    .refine(
      (password) => /[!@#$%^&*()_+\-=\[\]{};`':"\\|,.<>\/?]/.test(password),
      'Password must contain at least 1 symbol'
    ),
  dpdpConsent: z.boolean().refine((value) => value === true, {
    message: 'You must accept the Privacy Policy and Terms to sign up (DPDP consent).',
  }),
})

const formId = 'sign-up-form'

const hcaptchaSiteKey =
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY : undefined

export const SignUpForm = () => {
  const captchaRef = useRef<HCaptcha>(null)
  const [showConditions, setShowConditions] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [passwordHidden, setPasswordHidden] = useState(true)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const router = useRouter()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', dpdpConsent: false },
  })

  const [searchParams] = useQueryStates({
    auth_id: parseAsString.withDefault(''),
    token: parseAsString.withDefault(''),
  })

  const { mutate: signup, isPending: isSigningUp } = useSignUpMutation({
    onSuccess: async (_data, variables) => {
      toast.success(`Signed up successfully!`)
      setIsSubmitted(true)
    },
    onError: (error) => {
      const msg = error.message?.toLowerCase() ?? ''
      // Timeouts / soft pending responses mean confirmation mail may already be sent.
      // Prompting another signup creates duplicate confirmation emails.
      if (
        msg.includes('pending_confirmation') ||
        msg.includes('check your inbox') ||
        msg.includes('do not sign up again') ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('processing this request')
      ) {
        toast.message('Check your email to confirm', {
          description:
            'A confirmation link is usually already on the way. Wait a minute and check spam before trying again.',
        })
        setIsSubmitted(true)
        return
      }
      setCaptchaToken(null)
      captchaRef.current?.resetCaptcha()
      toast.error(`Failed to sign up: ${error.message}`)
    },
  })

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = async ({
    email,
    password,
    dpdpConsent,
  }) => {
    // [Joshen] Separate submitting state as there's 2 async processes here
    let token = captchaToken
    if (hcaptchaSiteKey && !token) {
      const captchaResponse = await captchaRef.current?.execute({ async: true })
      token = captchaResponse?.response ?? null
    }

    const isInsideOAuthFlow = !!searchParams.auth_id
    // Use browser origin at runtime so deploy-time env mismatches don't force localhost.
    const redirectUrlBase = `${location.origin}${BASE_PATH}`

    let redirectTo: string

    if (isInsideOAuthFlow) {
      redirectTo = `${redirectUrlBase}/authorize?auth_id=${searchParams.auth_id}${searchParams.token && `&token=${searchParams.token}`}`
    } else {
      // Use getRedirectToPath to handle redirect_to parameter and other query params
      const { returnTo } = router.query
      const basePath = returnTo || '/sign-in'
      const fullPath = buildPathWithParams(basePath as string)
      const fullRedirectUrl = `${redirectUrlBase}${fullPath}`
      redirectTo = fullRedirectUrl
    }

    signup({
      email,
      password,
      hcaptchaToken: token ?? null,
      redirectTo,
      dpdpConsent,
    })
  }

  const password = form.watch('password')
  const isSubmitting = form.formState.isSubmitting || isSigningUp

  return (
    <div className="relative">
      {isSubmitted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="absolute top-0 w-full"
        >
          <Alert_Shadcn_ variant="default">
            <CheckCircle />
            <AlertTitle_Shadcn_>Check your email to confirm</AlertTitle_Shadcn_>
            <AlertDescription_Shadcn_ className="text-xs">
              You've successfully signed up. Please check your email to confirm your account before
              signing in to the Indobase dashboard. The confirmation link expires in 10 minutes.
            </AlertDescription_Shadcn_>
          </Alert_Shadcn_>
        </motion.div>
      )}
      <div
        className={cn(
          'w-full py-1 transition-all duration-500',
          isSubmitted ? 'max-h-[100px] opacity-0 pointer-events-none' : 'max-h-[1000px] opacity-100'
        )}
      >
        <Form_Shadcn_ {...form}>
          <form id={formId} className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField_Shadcn_
              key="email"
              name="email"
              control={form.control}
              render={({ field }) => (
                <FormItemLayout name="email" label="Email">
                  <FormControl_Shadcn_>
                    <Input_Shadcn_
                      id="email"
                      autoComplete="email"
                      disabled={isSubmitting}
                      {...field}
                      placeholder="you@example.com"
                    />
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

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
                        autoComplete="new-password"
                        placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                        {...field}
                        onFocus={() => setShowConditions(true)}
                        disabled={isSubmitting}
                      />
                      <Button
                        type="default"
                        title={passwordHidden ? `Hide password` : `Show password`}
                        aria-label={passwordHidden ? `Hide password` : `Show password`}
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

            <div
              className={`${
                showConditions ? 'max-h-[500px]' : 'max-h-[0px]'
              } transition-all duration-400 overflow-y-hidden`}
            >
              <PasswordConditionsHelper password={password} />
            </div>

            {hcaptchaSiteKey ? (
              <div className="self-center">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={hcaptchaSiteKey}
                  size="invisible"
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
            ) : null}

            <FormField_Shadcn_
              name="dpdpConsent"
              control={form.control}
              render={({ field }) => (
                <FormItemLayout
                  name="dpdpConsent"
                  label={
                    <span className="text-xs text-foreground-light font-normal leading-relaxed">
                      I agree to the{' '}
                      <Link
                        href={INDOBASE_TERMS_URL}
                        className="underline text-foreground"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Terms
                      </Link>{' '}
                      and{' '}
                      <Link
                        href={INDOBASE_DPDP_POLICY_URL}
                        className="underline text-foreground"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  }
                >
                  <FormControl_Shadcn_>
                    <Checkbox_Shadcn_
                      checked={field.value === true}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={isSubmitting}
                    />
                  </FormControl_Shadcn_>
                </FormItemLayout>
              )}
            />

            <Button
              block
              form={formId}
              htmlType="submit"
              size="large"
              type="primary"
              disabled={password.length === 0 || isSubmitting}
              loading={isSubmitting}
            >
              Sign up
            </Button>
          </form>
        </Form_Shadcn_>
      </div>
    </div>
  )
}
