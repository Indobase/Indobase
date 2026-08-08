import { createConnectQueryKey, useMutation } from '@connectrpc/connect-query'
import {
  Button,
  DialogDescription,
  DialogTitle,
  Form,
  InputFormField,
  Modal,
  Spinner,
} from '@md/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, CheckCircle2, Landmark, Key, WebhookIcon } from 'lucide-react'
import { Fragment, KeyboardEvent as ReactKeyboardEvent, createElement, useState } from 'react'
import { useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { CopyToClipboardButton } from '@/components/CopyToClipboard'
import { indiaSettlementsSchema } from '@/features/settings/integrations/schemas'
import { useTenant } from '@/hooks/useTenant'
import { useZodForm } from '@/hooks/useZodForm'
import { env } from '@/lib/env'
import {
  connectRazorpay,
  listConnectors,
} from '@/rpc/api/connectors/v1/connectors-ConnectorsService_connectquery'
import { TenantEnvironmentEnum } from '@/rpc/api/tenants/v1/models_pb'

/**
 * Enable India settlements — machine credentials only.
 * Operator chrome says Indobase / India settlements (not a second product login).
 */
export const IndiaSettlementsIntegrationModal = () => {
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const restApiUrl = env.meteroidRestApiUri
  const isProduction = tenant?.environment === TenantEnvironmentEnum.PRODUCTION

  const methods = useZodForm({
    mode: 'onChange',
    schema: indiaSettlementsSchema,
    defaultValues: {
      alias: 'india',
      keyId: '',
      keySecret: '',
      webhookSecret: '',
    },
  })

  const alias = useWatch({
    control: methods.control,
    name: 'alias',
  })

  const steps = [
    {
      id: 'alias',
      title: 'Connection',
      description: (
        <>
          Choose a unique alias for this India settlements connection.
          <br />
          You can add more later if you need multiple merchant keys.
        </>
      ),
      icon: Building2,
      fields: ['alias'] as const,
    },
    {
      id: 'keys',
      title: 'API Keys',
      description: (
        <span>
          Paste machine credentials from the Razorpay Dashboard after KYC (
          {isProduction ? 'live' : 'test'} mode). Prefer Studio / OS Connect gateway (one paste syncs
          here automatically).
        </span>
      ),
      icon: Key,
      fields: ['keyId', 'keySecret'] as const,
    },
    {
      id: 'webhook',
      title: 'Webhooks',
      description: (
        <span>
          Create a webhook endpoint that posts to Indobase Payments, then paste the signing secret.
          <div className="bg-card p-4 rounded-lg space-y-3 mt-4">
            <ol className="space-y-2 text-sm text-card-foreground">
              <li>
                Endpoint URL:
                <br />
                <CopyToClipboardButton
                  text={`${restApiUrl}/webhooks/v1/${tenant?.id}/${alias}`}
                  className="whitespace-normal"
                />
              </li>
              <li>
                Prefer events for payments and refunds. Mandate / token events will be used when
                Recurring Payments charging is enabled.
              </li>
            </ol>
          </div>
        </span>
      ),
      icon: WebhookIcon,
      fields: ['webhookSecret'] as const,
    },
  ]

  const fieldInfo = {
    alias: {
      label: 'Connection name',
      placeholder: 'india',
      help: "e.g., 'india' or 'india-inr'",
    },
    keyId: {
      label: 'Key Id',
      placeholder: isProduction ? 'rzp_live_…' : 'rzp_test_…',
      help: undefined,
    },
    keySecret: {
      label: 'Key Secret',
      placeholder: '',
      help: undefined,
    },
    webhookSecret: {
      label: 'Webhook secret',
      placeholder: '',
      help: undefined,
    },
  }

  const [currentStep, setCurrentStep] = useState(0)
  const queryClient = useQueryClient()
  const connectMutation = useMutation(connectRazorpay, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listConnectors,
          cardinality: 'finite',
        }),
      })
    },
  })

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      methods.trigger(steps[currentStep].fields).then(res => {
        if (res) {
          setCurrentStep(prev => prev + 1)
        }
      })
    } else {
      methods.handleSubmit(onSubmit)()
    }
  }

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const isLastInput = idx === steps[currentStep].fields.length - 1
    if (isLastInput) {
      handleNext()
    } else {
      methods.setFocus(steps[currentStep].fields[idx + 1])
    }
  }

  const onSubmit = async (data: z.infer<typeof indiaSettlementsSchema>) => {
    try {
      await connectMutation.mutateAsync({
        data: {
          alias: data.alias,
          keyId: data.keyId,
          keySecret: data.keySecret,
          webhookSecret: data.webhookSecret,
        },
      })
      toast.success('India settlements enabled')
      navigate('..')
    } catch {
      toast.error('Could not save India settlements credentials')
    }
  }

  return (
    <Modal
      header={
        <>
          <DialogTitle className="flex items-center gap-2 text-md">
            <Landmark className="w-6 h-6 text-brand" />
            <span>Enable India settlements</span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Connect machine credentials so Indobase Payments can settle INR charges to your merchant
            account. Live Recurring charge APIs land next — saving keys unlocks webhooks today.
          </DialogDescription>
        </>
      }
      visible={true}
      hideFooter={true}
      onCancel={() => navigate('..')}
    >
      <Modal.Content>
        <Form {...methods}>
          <form autoComplete="off">
            <div className="flex items-center justify-center gap-2 mb-6 mt-4">
              {steps.map((_step, idx) => (
                <Fragment key={idx}>
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                      currentStep === idx
                        ? 'bg-brand text-brand-foreground'
                        : currentStep > idx
                          ? 'bg-success text-success-foreground'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {currentStep > idx ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-16 transition-colors ${
                        currentStep > idx ? 'bg-success' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </Fragment>
              ))}
            </div>

            <div className="flex justify-center">
              {createElement(steps[currentStep].icon, {
                className: 'w-12 h-12 text-brand',
                strokeWidth: 1.2,
              })}
            </div>

            <div className="text-center space-y-2 mb-6 mt-2">
              <h3 className="text-md font-semibold">{steps[currentStep].title}</h3>
              <p className="text-muted-foreground text-sm">{steps[currentStep].description}</p>
            </div>

            <div className="space-y-6">
              {steps[currentStep].fields.map((field, idx) => (
                <div key={field} className="space-y-2">
                  <InputFormField
                    control={methods.control}
                    label={fieldInfo[field].label}
                    name={field}
                    type={field === 'keySecret' || field === 'webhookSecret' ? 'password' : 'text'}
                    placeholder={fieldInfo[field].placeholder}
                    description={fieldInfo[field].help}
                    onKeyDown={e => handleInputKeyDown(e, idx)}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-8 mb-2">
              <Button
                type="button"
                variant="ghost"
                disabled={currentStep === 0 || connectMutation.isPending}
                onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
              >
                Back
              </Button>
              <Button type="button" onClick={handleNext} disabled={connectMutation.isPending}>
                {connectMutation.isPending ? (
                  <Spinner size="sm" />
                ) : currentStep === steps.length - 1 ? (
                  'Enable'
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </Modal.Content>
    </Modal>
  )
}
