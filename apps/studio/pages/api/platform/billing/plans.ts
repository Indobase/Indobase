import type { NextApiRequest, NextApiResponse } from 'next'

import apiWrapper from 'lib/api/apiWrapper'

type Plan = {
  id: string
  name: string
  display_name: string
  monthly_price: number | null
  annual_price: number | null
  currency: string
  description: string
  features: string[]
  limits: Record<string, number>
  overage_rates: Record<string, number>
  popular: boolean
  available: boolean
  savings?: string
  contact_sales?: boolean
  gst_notice?: string
  payment_methods?: string[]
}

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      await getPlans(req, res)
      return
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
      return
  }
}

async function getPlans(req: NextApiRequest, res: NextApiResponse) {
  try {
    const currency = typeof req.query.currency === 'string' ? req.query.currency : 'INR'

    const plans: Plan[] = [
      {
        id: 'free',
        name: 'Free',
        display_name: 'Free',
        monthly_price: 0,
        annual_price: 0,
        currency,
        description: 'Perfect for trying out the platform',
        features: [
          '500MB Database',
          '50K Monthly Active Users',
          '1GB Storage',
          '500K Function Invocations',
          'Community Support',
          'Unlimited API Requests',
        ],
        limits: {
          database_size: 536870912,
          auth_maus: 50000,
          storage_size: 1073741824,
          functions_invocations: 500000,
          realtime_connections: 200,
          realtime_messages: 2000000,
        },
        overage_rates: {
          database_size: currency === 'INR' ? 0.000010417 : 0.000000125,
          auth_maus: currency === 'INR' ? 0.27 : 0.00325,
          storage_size: currency === 'INR' ? 1.75 : 0.021,
          functions_invocations: currency === 'INR' ? 0.000167 : 0.000002,
        },
        popular: false,
        available: true,
      },
      {
        id: 'pro',
        name: 'Pro',
        display_name: 'Pro',
        monthly_price: currency === 'INR' ? 2083 : 25,
        annual_price: currency === 'INR' ? 19997 : 240,
        currency,
        description: 'For growing applications and startups',
        features: [
          '8GB Database',
          '100K Monthly Active Users',
          '100GB Storage',
          '2M Function Invocations',
          'Email Support',
          'Remove Branding',
          'Unlimited API Requests',
          'Advanced Disk Config',
        ],
        limits: {
          database_size: 8589934592,
          auth_maus: 100000,
          storage_size: 107374182400,
          functions_invocations: 2000000,
          realtime_connections: 500,
          realtime_messages: 5000000,
        },
        overage_rates: {
          database_size: currency === 'INR' ? 0.000010417 : 0.000000125,
          auth_maus: currency === 'INR' ? 0.27 : 0.00325,
          storage_size: currency === 'INR' ? 1.75 : 0.021,
          functions_invocations: currency === 'INR' ? 0.000167 : 0.000002,
        },
        popular: true,
        available: true,
        savings: currency === 'INR' ? 'Save ₹6,983 with annual billing' : 'Save $60 with annual billing',
      },
      {
        id: 'team',
        name: 'Team',
        display_name: 'Team',
        monthly_price: currency === 'INR' ? 49717 : 599,
        annual_price: currency === 'INR' ? 477283 : 5750,
        currency,
        description: 'For scaling businesses with advanced needs',
        features: [
          '8GB Database',
          '100K Monthly Active Users',
          '100GB Storage',
          '2M Function Invocations',
          '28 Days Log Retention',
          'Platform Audit Logs',
          'SLA Support',
          'Advanced Security Features',
          'Priority Support',
        ],
        limits: {
          database_size: 8589934592,
          auth_maus: 100000,
          storage_size: 107374182400,
          functions_invocations: 2000000,
          realtime_connections: 500,
          realtime_messages: 5000000,
        },
        overage_rates: {
          database_size: currency === 'INR' ? 0.000010417 : 0.000000125,
          auth_maus: currency === 'INR' ? 0.27 : 0.00325,
          storage_size: currency === 'INR' ? 1.75 : 0.021,
          functions_invocations: currency === 'INR' ? 0.000167 : 0.000002,
        },
        popular: false,
        available: true,
        savings: currency === 'INR' ? 'Save ₹119,321 with annual billing' : 'Save $1,438 with annual billing',
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        display_name: 'Enterprise',
        monthly_price: null,
        annual_price: null,
        currency,
        description: 'Custom solutions for large organizations',
        features: [
          'Custom Database Size',
          'Unlimited MAUs',
          'Custom Storage',
          'Unlimited Functions',
          '90 Days Log Retention',
          'SOC2/HIPAA Compliance',
          'Dedicated Support',
          'Custom SLA',
          'Private Link',
          'SSO/SAML',
        ],
        limits: {},
        overage_rates: {},
        popular: false,
        available: true,
        contact_sales: true,
      },
    ]

    if (currency === 'INR') {
      plans.forEach((plan) => {
        if (plan.contact_sales) return
        plan.gst_notice = '+ 18% GST applicable'
        plan.payment_methods = [
          'UPI (Google Pay, PhonePe, Paytm)',
          'Credit/Debit Cards (RuPay, Visa, Mastercard)',
          'Net Banking',
          'Digital Wallets',
          'EMI available for annual plans',
        ]
      })
    }

    res.status(200).json({
      data: plans,
      currency,
      exchange_rate: currency === 'INR' ? 83 : 1,
    })
  } catch (error) {
    console.error('Error fetching plans:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: { message } })
  }
}
