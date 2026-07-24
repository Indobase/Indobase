import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { PaymentsApiClient } from './payments-mcp'

function textResult(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
  }
}

const paginationShape = {
  page: z.number().int().min(0).optional().describe('Page number (0-indexed)'),
  per_page: z.number().int().min(1).max(100).optional().describe('Items per page (max 100)'),
}

export type PaymentsMcpServerOptions = {
  readOnly?: boolean
  /**
   * When false, live-charge tools (checkout session / subscription create) refuse.
   * Browse + plan/customer create remain available for setup before go-live.
   */
  liveChargesAllowed?: boolean
}

function liveChargeGate(liveChargesAllowed: boolean | undefined) {
  if (liveChargesAllowed === false) {
    throw new Error(
      'Merchant KYC is not verified — confirm Stripe go-live in Studio Payments before create_checkout_session or create_subscription.'
    )
  }
}

/**
 * Indobase Payments MCP tools — proxies Indobase Payments REST (`/api/v1/*`).
 * Brand: Indobase Payments (not Meteroid) in all tool descriptions.
 */
export function createPaymentsMcpServer(client: PaymentsApiClient, opts?: PaymentsMcpServerOptions) {
  const readOnly = opts?.readOnly ?? false
  const liveChargesAllowed = opts?.liveChargesAllowed
  const server = new McpServer({
    name: 'indobase-payments',
    title: 'Indobase Payments',
    version: '1.0.0',
  })

  server.registerTool(
    'list_plans',
    {
      title: 'List plans',
      description: 'List Indobase Payments plans for the linked Studio organization tenant.',
      inputSchema: {
        search: z.string().optional().describe('Search by plan name'),
        status: z.string().optional().describe('Filter status e.g. ACTIVE, DRAFT'),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', '/api/v1/plans', {
          query: {
            search: args.search,
            status: args.status,
            page: args.page,
            per_page: args.per_page ?? 25,
          },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'get_plan',
    {
      title: 'Get plan',
      description: 'Get a single Indobase Payments plan by id.',
      inputSchema: {
        plan_id: z.string().min(1).describe('Plan id'),
        version: z.string().optional().describe('draft | active version number'),
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', `/api/v1/plans/${encodeURIComponent(args.plan_id)}`, {
          query: { version: args.version },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'list_customers',
    {
      title: 'List customers',
      description: 'List Indobase Payments customers.',
      inputSchema: {
        search: z.string().optional(),
        archived: z.boolean().optional(),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', '/api/v1/customers', {
          query: {
            search: args.search,
            archived: args.archived,
            page: args.page,
            per_page: args.per_page ?? 25,
          },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'get_customer',
    {
      title: 'Get customer',
      description: 'Get an Indobase Payments customer by id or alias.',
      inputSchema: {
        id_or_alias: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const data = await client.request(
          'GET',
          `/api/v1/customers/${encodeURIComponent(args.id_or_alias)}`
        )
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'list_invoices',
    {
      title: 'List invoices',
      description: 'List Indobase Payments invoices (optionally by customer or subscription).',
      inputSchema: {
        customer_id: z.string().optional(),
        subscription_id: z.string().optional(),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', '/api/v1/invoices', {
          query: {
            customer_id: args.customer_id,
            subscription_id: args.subscription_id,
            page: args.page,
            per_page: args.per_page ?? 25,
          },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'get_invoice',
    {
      title: 'Get invoice',
      description:
        'Get an Indobase Payments invoice by id (includes payment transactions / settlement status after Stripe webhooks).',
      inputSchema: {
        invoice_id: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const data = await client.request(
          'GET',
          `/api/v1/invoices/${encodeURIComponent(args.invoice_id)}`
        )
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'list_subscriptions',
    {
      title: 'List subscriptions',
      description: 'List Indobase Payments subscriptions.',
      inputSchema: {
        customer_id: z.string().optional(),
        plan_id: z.string().optional(),
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', '/api/v1/subscriptions', {
          query: {
            customer_id: args.customer_id,
            plan_id: args.plan_id,
            page: args.page,
            per_page: args.per_page ?? 25,
          },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'get_subscription',
    {
      title: 'Get subscription',
      description: 'Get an Indobase Payments subscription by id.',
      inputSchema: {
        subscription_id: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const data = await client.request(
          'GET',
          `/api/v1/subscriptions/${encodeURIComponent(args.subscription_id)}`
        )
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'list_product_families',
    {
      title: 'List product families',
      description: 'List product families (needed before creating plans).',
      inputSchema: {
        ...paginationShape,
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', '/api/v1/product_families', {
          query: {
            page: args.page,
            per_page: args.per_page ?? 25,
          },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'list_checkout_sessions',
    {
      title: 'List checkout sessions',
      description: 'List Indobase Payments checkout sessions (optionally by customer or status).',
      inputSchema: {
        customer_id: z.string().optional().describe('Customer id'),
        status: z
          .string()
          .optional()
          .describe('CREATED | AWAITING_PAYMENT | COMPLETED | EXPIRED | CANCELLED'),
      },
    },
    async (args) => {
      try {
        const data = await client.request('GET', '/api/v1/checkout-sessions', {
          query: {
            customer_id: args.customer_id,
            status: args.status,
          },
        })
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    'get_checkout_session',
    {
      title: 'Get checkout session',
      description: 'Get a checkout session by id (includes checkout_url when still completable).',
      inputSchema: {
        session_id: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const data = await client.request(
          'GET',
          `/api/v1/checkout-sessions/${encodeURIComponent(args.session_id)}`
        )
        return textResult(data)
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  if (!readOnly) {
    server.registerTool(
      'create_customer',
      {
        title: 'Create customer',
        description:
          'Create an Indobase Payments customer. Required: name, currency, invoicing_emails, custom_taxes (array, may be empty).',
        inputSchema: {
          name: z.string().min(1),
          currency: z.string().min(1).describe('ISO currency e.g. INR'),
          invoicing_emails: z.array(z.string().email()).min(1),
          custom_taxes: z.array(z.record(z.unknown())).optional(),
          alias: z.string().optional(),
          billing_email: z.string().email().optional(),
          body: z
            .record(z.unknown())
            .optional()
            .describe('Optional extra CustomerCreateRequest fields merged into the body'),
        },
      },
      async (args) => {
        try {
          const { body: extra, ...fields } = args
          const data = await client.request('POST', '/api/v1/customers', {
            body: {
              name: fields.name,
              currency: fields.currency,
              invoicing_emails: fields.invoicing_emails,
              custom_taxes: fields.custom_taxes ?? [],
              ...(fields.alias ? { alias: fields.alias } : {}),
              ...(fields.billing_email ? { billing_email: fields.billing_email } : {}),
              ...(extra || {}),
            },
          })
          return textResult(data)
        } catch (error) {
          return errorResult(error)
        }
      }
    )

    server.registerTool(
      'create_plan',
      {
        title: 'Create plan',
        description:
          'Create an Indobase Payments plan. Pass a full CreatePlanRequest body (name, product_family_id, plan_type, status, currency, components).',
        inputSchema: {
          body: z.record(z.unknown()).describe('CreatePlanRequest JSON body'),
        },
      },
      async (args) => {
        try {
          const data = await client.request('POST', '/api/v1/plans', { body: args.body })
          return textResult(data)
        } catch (error) {
          return errorResult(error)
        }
      }
    )

    server.registerTool(
      'create_subscription',
      {
        title: 'Create subscription',
        description:
          'Create an Indobase Payments subscription (live charge path). Requires verified merchant KYC. Prefer create_checkout_session for self-serve pricing pages.',
        inputSchema: {
          body: z.record(z.unknown()).describe('CreateSubscriptionRequest JSON body'),
        },
      },
      async (args) => {
        try {
          liveChargeGate(liveChargesAllowed)
          const data = await client.request('POST', '/api/v1/subscriptions', { body: args.body })
          return textResult(data)
        } catch (error) {
          return errorResult(error)
        }
      }
    )

    server.registerTool(
      'create_checkout_session',
      {
        title: 'Create checkout session',
        description:
          'Create a hosted Indobase Payments checkout session. Returns session.checkout_url for pricing CTAs. Requires verified merchant KYC. Required: customer_id, plan_version_id.',
        inputSchema: {
          customer_id: z.string().min(1).describe('Customer id or alias'),
          plan_version_id: z.string().min(1).describe('Plan version id from get_plan / create_plan'),
          expires_in_hours: z.number().int().min(0).optional(),
          trial_duration_days: z.number().int().optional(),
          coupon_code: z.string().optional(),
          charge_automatically: z.boolean().optional(),
          auto_advance_invoices: z.boolean().optional(),
          body: z
            .record(z.unknown())
            .optional()
            .describe('Optional extra CreateCheckoutSessionRequest fields merged into the body'),
        },
      },
      async (args) => {
        try {
          liveChargeGate(liveChargesAllowed)
          const { body: extra, ...fields } = args
          const data = await client.request('POST', '/api/v1/checkout-sessions', {
            body: {
              customer_id: fields.customer_id,
              plan_version_id: fields.plan_version_id,
              ...(fields.expires_in_hours !== undefined
                ? { expires_in_hours: fields.expires_in_hours }
                : {}),
              ...(fields.trial_duration_days !== undefined
                ? { trial_duration_days: fields.trial_duration_days }
                : {}),
              ...(fields.coupon_code ? { coupon_code: fields.coupon_code } : {}),
              ...(fields.charge_automatically !== undefined
                ? { charge_automatically: fields.charge_automatically }
                : {}),
              ...(fields.auto_advance_invoices !== undefined
                ? { auto_advance_invoices: fields.auto_advance_invoices }
                : {}),
              ...(extra || {}),
            },
          })
          return textResult(data)
        } catch (error) {
          return errorResult(error)
        }
      }
    )

    server.registerTool(
      'create_portal_token',
      {
        title: 'Create customer portal token',
        description:
          'Mint a customer portal token + portal_url. Open `${portal_url}/portal/customer?token=…` for manage-billing UX. Prefer server/edge minting in published apps.',
        inputSchema: {
          id_or_alias: z.string().min(1).describe('Customer id or alias'),
        },
      },
      async (args) => {
        try {
          const data = await client.request(
            'POST',
            `/api/v1/customers/${encodeURIComponent(args.id_or_alias)}/portal-token`
          )
          return textResult(data)
        } catch (error) {
          return errorResult(error)
        }
      }
    )
  }

  return server
}
