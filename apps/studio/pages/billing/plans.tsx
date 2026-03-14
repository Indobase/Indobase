import { useRouter } from 'next/router'
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Text, Button, Badge, Toggle } from '@ui-library/components';
import { Icon } from '@ui-library/components';

import { useOrganizationsQuery } from 'data/organizations/organizations-query'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { withAuth } from 'hooks/misc/withAuth'
import { BASE_PATH } from 'lib/constants'

interface Plan {
  id: string;
  name: string;
  display_name: string;
  monthly_price: number | null;
  annual_price: number | null;
  currency: string;
  description: string;
  features: string[];
  popular?: boolean;
  contact_sales?: boolean;
  available?: boolean;
  gst_notice?: string;
  payment_methods?: string[];
}

// Contact sales URL: same origin so it works for single-domain (e.g. indobase.fun/dashboard → indobase.fun/contact-us/enterprise)
const getContactSalesUrl = () =>
  typeof window !== 'undefined' ? `${window.location.origin}/contact-us/enterprise` : '/contact-us/enterprise'

function PricingPlansPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [annualBilling, setAnnualBilling] = useState(false);

  const { data: organizations = [] } = useOrganizationsQuery()
  const hasExistingOrgs = organizations.length > 0
  const { mutate: sendEvent } = useSendEventMutation()
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null)
  const hasTrackedPageView = useRef(false)

  useEffect(() => {
    fetchPlans();
  }, [currency]);

  useEffect(() => {
    if (!loading && plans.length > 0 && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true
      sendEvent({ action: 'billing_plans_page_viewed', properties: {} })
    }
  }, [loading, plans.length, sendEvent])

  const fetchPlans = async () => {
    setFetchError(null)
    try {
      const response = await fetch(`${BASE_PATH}/api/platform/billing/plans?currency=${currency}`);
      const result = await response.json();
      if (!response.ok) {
        setFetchError(result.error?.message ?? `Failed to load plans (${response.status})`);
        return;
      }
      if (result.data && Array.isArray(result.data)) {
        setPlans(result.data);
      } else {
        setFetchError(result.error?.message ?? 'Failed to load plans');
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
      setFetchError(error instanceof Error ? error.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (plan: Plan) => {
    if (selectingPlanId) return
    setSelectingPlanId(plan.id)
    sendEvent({
      action: 'billing_plan_selected',
      properties: { plan_id: plan.id, contact_sales: Boolean(plan.contact_sales) },
    })
    // Enterprise / contact sales → contact page; free, pro, team → create org (product access)
    if (plan.contact_sales || plan.id === 'enterprise') {
      window.location.href = getContactSalesUrl()
      return
    }
    router.push(`/new?plan=${plan.id}`)
  }

  const handleStartWithFree = () => {
    if (selectingPlanId) return
    setSelectingPlanId('free')
    sendEvent({
      action: 'billing_plan_selected',
      properties: { plan_id: 'free', contact_sales: false },
    })
    router.push('/new?plan=free')
  }

  const formatPrice = (price: number | null) => {
    if (price === null || price === 0) return 'Free';
    
    if (currency === 'INR') {
      if (price >= 100000) {
        return `₹${(price / 100000).toFixed(2)} L`;
      }
      return `₹${price.toLocaleString('en-IN')}`;
    }
    
    return `$${price.toLocaleString('en-US')}`;
  };

  if (loading && plans.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Text>Loading plans...</Text>
      </div>
    );
  }

  if (fetchError && plans.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <Text className="text-center text-gray-600">Could not load plans. Please try again.</Text>
        <Button variant="primary" onClick={() => { setLoading(true); fetchPlans(); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center mb-12">
        {hasExistingOrgs && (
          <p className="mb-4">
            <Link
              href="/organizations"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
            >
              ← Go to dashboard
            </Link>
          </p>
        )}
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Choose the Perfect Plan for Your Business
        </h1>
        <p className="text-lg text-gray-600 mb-4">
          Transparent pricing with no hidden fees. All plans include GST compliance.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          New to Indobase?{' '}
          <button
            type="button"
            onClick={handleStartWithFree}
            disabled={!!selectingPlanId}
            className="font-medium text-gray-700 hover:text-gray-900 underline disabled:opacity-50"
          >
            {selectingPlanId === 'free' ? 'Taking you to create org…' : 'Start with Free and upgrade later'}
          </button>
        </p>

        {/* Currency and Billing Toggle */}
        <div className="flex justify-center items-center gap-4 mb-8">
          <div className="flex rounded-lg border p-1">
            <Button
              variant={currency === 'INR' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setCurrency('INR')}
            >
              ₹ INR
            </Button>
            <Button
              variant={currency === 'USD' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setCurrency('USD')}
            >
              $ USD
            </Button>
          </div>

          {currency === 'INR' && (
            <div className="flex items-center gap-2">
              <Text className="text-sm">Monthly</Text>
              <Toggle checked={annualBilling} onChange={setAnnualBilling} />
              <Text className="text-sm">Annual</Text>
              {annualBilling && (
                <Badge color="green">Save up to 17%</Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plans Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <Card 
            key={plan.id}
            className={`relative ${
              plan.popular ? 'border-emerald-500 border-2 shadow-xl' : 'border-gray-200'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge color="green" size="lg">Most Popular</Badge>
              </div>
            )}

            <Card.Content className="pt-6 pb-4">
              <div className="space-y-4">
                {/* Plan Name */}
                <div>
                  <Text className="text-xl font-bold text-gray-900">{plan.display_name}</Text>
                  <Text className="text-sm text-gray-500 mt-1">{plan.description}</Text>
                </div>

                {/* Price */}
                <div className="py-4">
                  {plan.contact_sales ? (
                    <div className="text-center">
                      <Text className="text-3xl font-bold text-gray-900">Custom</Text>
                      <Text className="text-sm text-gray-500 mt-1">Contact sales for pricing</Text>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-4xl font-bold text-gray-900">
                        {formatPrice(annualBilling ? plan.annual_price : plan.monthly_price)}
                      </div>
                      <Text className="text-sm text-gray-500 mt-1">
                        {annualBilling && plan.annual_price ? '/year' : '/month'}
                      </Text>
                      {plan.gst_notice && (
                        <Text className="text-xs text-gray-500 mt-2">{plan.gst_notice}</Text>
                      )}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Icon name="check-circle" className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <Text className="text-sm text-gray-700">{feature}</Text>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  className="w-full mt-6"
                  variant={plan.popular ? 'primary' : 'outline'}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={plan.available === false || selectingPlanId !== null}
                >
                  {selectingPlanId === plan.id ? 'Loading…' : plan.contact_sales ? 'Contact Sales' : 'Get Started'}
                </Button>

                {/* Payment Methods for INR */}
                {currency === 'INR' && plan.payment_methods && (
                  <div className="mt-4 pt-4 border-t">
                    <Text className="text-xs font-medium text-gray-500 mb-2">Accepted Payments:</Text>
                    <div className="flex flex-wrap gap-1">
                      {plan.payment_methods.slice(0, 3).map((method, idx) => (
                        <Badge key={idx} color="gray" size="sm">{method.split(' ')[0]}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* Enterprise Banner */}
      <div className="max-w-7xl mx-auto mt-12">
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <Card.Content>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Text className="text-lg font-bold text-gray-900">Need a Custom Solution?</Text>
                <Text className="text-sm text-gray-600">
                  Our Enterprise plan offers custom limits, dedicated support, and advanced compliance features.
                </Text>
              </div>
              <Button variant="primary" onClick={() => (window.location.href = getContactSalesUrl())}>
                Contact Sales
              </Button>
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* FAQ Section */}
      <div className="max-w-7xl mx-auto mt-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Frequently Asked Questions</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FAQItem
            question="What payment methods do you accept for INR billing?"
            answer="We accept UPI (Google Pay, PhonePe, Paytm), all major Credit/Debit Cards (RuPay, Visa, Mastercard), Net Banking from all Indian banks, and digital wallets. EMI options are available for annual plans."
          />
          
          <FAQItem
            question="Is GST included in the pricing?"
            answer="All prices shown are exclusive of GST. As per Indian tax regulations, 18% GST will be added at checkout. We provide GST invoices for all payments."
          />
          
          <FAQItem
            question="Can I switch plans later?"
            answer="Yes! You can upgrade or downgrade your plan at any time. Prorated charges will apply for mid-cycle changes."
          />
          
          <FAQItem
            question="What happens if I exceed my quota?"
            answer="When you exceed your plan's included quotas, overage charges apply at the rates specified in your plan. You'll receive email alerts before reaching your limits."
          />
          
          <FAQItem
            question="Do you offer discounts for startups?"
            answer="Yes! We have special startup programs offering up to 50% off for eligible early-stage companies. Contact our sales team to learn more."
          />
          
          <FAQItem
            question="What is the billing cycle?"
            answer="You can choose between monthly or annual billing. Annual billing offers significant savings (up to 17% discount)."
          />
        </div>
      </div>
    </div>
  );
}

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => (
  <Card>
    <Card.Content>
      <h3 className="font-semibold text-gray-900 mb-2">{question}</h3>
      <p className="text-sm text-gray-600">{answer}</p>
    </Card.Content>
  </Card>
);

export default withAuth(PricingPlansPage)
