import { useState, useEffect } from 'react';
import { Card, Text, Button, Badge, Toggle } from '@ui-library/components';
import { Icon } from '@ui-library/components';

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
  gst_notice?: string;
  payment_methods?: string[];
}

export default function PricingPlansPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [annualBilling, setAnnualBilling] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, [currency]);

  const fetchPlans = async () => {
    try {
      const response = await fetch(`/api/platform/billing/plans?currency=${currency}`);
      const result = await response.json();
      if (result.data) {
        setPlans(result.data);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    // Redirect to checkout or upgrade flow
    window.location.href = `/billing/checkout?plan=${planId}&billing=${annualBilling ? 'annual' : 'monthly'}`;
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Text>Loading plans...</Text>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Choose the Perfect Plan for Your Business
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Transparent pricing with no hidden fees. All plans include GST compliance.
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
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={!plan.available}
                >
                  {plan.contact_sales ? 'Contact Sales' : 'Get Started'}
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
              <Button variant="primary" onClick={() => window.location.href = '/contact-sales'}>
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
