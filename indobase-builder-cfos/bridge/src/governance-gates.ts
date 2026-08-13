/**
 * Operator-facing governance explanations (quota, account, payments BYOK).
 * Indobase branding only — clear choices when a tool/path is blocked.
 */

export type GovernanceGateCode =
  | 'prompt_quota_exceeded'
  | 'account_required'
  | 'gateway_not_ready'
  | 'payments_byok_required'
  | 'plan_upgrade_required'
  | 'wire_required'

export type GovernanceChoice = {
  label: string
  message: string
}

export type GovernanceGateExplanation = {
  code: GovernanceGateCode
  title: string
  /** Full operator-facing copy for chat / tool JSON.message */
  message: string
  /** Short why-blocked line */
  reason: string
  choices: GovernanceChoice[]
  upgrade_url?: string | null
}

export type ExplainGovernanceGateInput = {
  code: GovernanceGateCode
  upgradeUrl?: string | null
  settlementHint?: 'india' | 'international' | null
}

const PLAN_LADDER =
  'Indobase plans: Free (5 agent prompts) → Basic (site) → Pro (customer login + business data) → Team.'

export function explainGovernanceGate(
  input: ExplainGovernanceGateInput,
): GovernanceGateExplanation {
  const upgradeUrl =
    typeof input.upgradeUrl === 'string' && input.upgradeUrl.trim()
      ? input.upgradeUrl.trim()
      : null

  switch (input.code) {
    case 'prompt_quota_exceeded':
    case 'plan_upgrade_required': {
      const billing =
        upgradeUrl != null
          ? ` Open billing to upgrade: ${upgradeUrl}`
          : ' Upgrade in chat to continue.'
      return {
        code: input.code === 'plan_upgrade_required' ? 'plan_upgrade_required' : 'prompt_quota_exceeded',
        title: 'Free agent limit reached',
        reason: 'This workspace used all 5 Free agent prompts.',
        message:
          `Free agent limit reached (5 prompts). Upgrade to continue building with Indobase.${billing} ${PLAN_LADDER}`,
        upgrade_url: upgradeUrl,
        choices: [
          {
            label: 'Upgrade to Pro',
            message:
              'Call upgradePlan with plan=pro so I can continue building with a higher Indobase prompt allowance',
          },
          {
            label: 'Upgrade for teams',
            message:
              'Call upgradePlan with plan=studio for team capacity and continue the launch ladder',
          },
          {
            label: 'Show plans',
            message:
              'Explain Indobase Free / Basic / Pro / Team plans and start the upgrade in chat',
          },
        ],
      }
    }
    case 'account_required':
      return {
        code: 'account_required',
        title: 'Account required',
        reason: 'Guests cannot launch or enable business features.',
        message:
          'Create your Indobase account first — finish email verification in chat (or Create account), then continue. Signed-in members can launch and enable payments.',
        choices: [
          {
            label: 'Create account',
            message:
              'Help me create my Indobase account now (name + email + DPDP consent → OTP verify)',
          },
        ],
      }
    case 'gateway_not_ready':
    case 'payments_byok_required': {
      const market =
        input.settlementHint === 'international'
          ? 'International: paste Stripe publishable + secret keys from your Stripe Dashboard after KYC.'
          : input.settlementHint === 'india'
            ? 'India: paste Razorpay Key Id + Key Secret from your Razorpay Dashboard after KYC.'
            : 'Choose India (Razorpay) or International (Stripe), finish PSP KYC, then paste API keys.'
      return {
        code: input.code === 'gateway_not_ready' ? 'gateway_not_ready' : 'payments_byok_required',
        title: 'Payments need your own gateway keys',
        reason:
          'Indobase uses bring-your-own-keys (BYOK) for checkout — we do not invent or host shared PSP credentials.',
        message:
          `Checkout is blocked until payment gateway keys are connected (Indobase BYOK — bring your own Razorpay/Stripe keys). ${market} ` +
          'Then call connectGateway, then wireCheckout. Never invent checkout URLs.',
        choices: [
          {
            label: 'India — Razorpay',
            message:
              'I finished Razorpay KYC — ask for my Key Id + Key Secret and call connectGateway settlement_market=india',
          },
          {
            label: 'International — Stripe',
            message:
              'I finished Stripe KYC — ask for my publishable + secret keys and call connectGateway settlement_market=international',
          },
          {
            label: 'Skip payments for now',
            message:
              'Continue without checkout — keep Buy CTA as placeholder and advance Go Live / production checklist',
          },
        ],
      }
    }
    case 'wire_required':
      return {
        code: 'wire_required',
        title: "Checkout isn't connected yet",
        reason: 'The storefront is still using placeholders instead of live products and checkout.',
        message:
          "Your storefront isn't connected to live products and checkout yet. I'll finish that setup and continue launch.",
        choices: [
          {
            label: 'Fix it automatically',
            message: 'Connect live products and checkout, then continue launch.',
          },
          {
            label: 'Continue editing',
            message: 'Continue editing the preview.',
          },
        ],
      }
    default: {
      const _exhaustive: never = input.code
      return _exhaustive
    }
  }
}

/** Prefer governance copy when tool/API returns a known block code. */
export function operatorMessageForGovernanceCode(
  code: string | null | undefined,
  opts?: { upgradeUrl?: string | null; settlementHint?: 'india' | 'international' | null; fallback?: string },
): string | null {
  const normalized = (code || '').trim().toLowerCase()
  const map: Record<string, GovernanceGateCode> = {
    prompt_quota_exceeded: 'prompt_quota_exceeded',
    plan_upgrade_required: 'plan_upgrade_required',
    account_required: 'account_required',
    gateway_not_ready: 'gateway_not_ready',
    payments_byok_required: 'payments_byok_required',
    payments_required: 'payments_byok_required',
    wire_required: 'wire_required',
  }
  const gate = map[normalized]
  if (!gate) return opts?.fallback ?? null
  return explainGovernanceGate({
    code: gate,
    upgradeUrl: opts?.upgradeUrl,
    settlementHint: opts?.settlementHint,
  }).message
}
