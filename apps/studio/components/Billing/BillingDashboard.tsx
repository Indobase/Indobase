import React, { useState, useEffect } from 'react';
import { Card, Text, Button, Grid, Badge, Progress, Table, Tabs, Icon, Alert } from '@ui-library/components';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface BillingDashboardProps {
  projectRef?: string;
  organizationId?: string;
}

interface UsageData {
  metric_type: string;
  metric_name: string;
  total_value: number;
  unit: string;
  quota_limit?: number;
  quota_used_percentage?: number;
  is_over_quota?: boolean;
  estimated_cost?: number;
}

interface Invoice {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax: number;
  total: number;
  status: 'paid' | 'pending' | 'overdue';
  currency: string;
}

interface Subscription {
  plan_name: string;
  plan_display_name: string;
  monthly_price: number;
  currency: string;
  status: 'active' | 'cancelled' | 'past_due';
  current_period_start: string;
  current_period_end: string;
}

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

export const BillingDashboard: React.FC<BillingDashboardProps> = ({ 
  projectRef, 
  organizationId 
}) => {
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'current' | 'previous'>('current');

  useEffect(() => {
    fetchBillingData();
  }, [currency, selectedPeriod]);

  const fetchBillingData = async () => {
    setLoading(true);
    try {
      // Fetch usage data
      const usageResponse = await fetch(
        `/api/platform/usage/analytics?ref=${projectRef}&org_id=${organizationId}&period=monthly&currency=${currency}`
      );
      const usageResult = await usageResponse.json();
      if (usageResult.data) {
        setUsageData(usageResult.data);
      }

      // Fetch invoices
      const invoicesResponse = await fetch(
        `/api/platform/billing/invoices?org_id=${organizationId}&currency=${currency}`
      );
      const invoicesResult = await invoicesResponse.json();
      if (invoicesResult.data) {
        setInvoices(invoicesResult.data);
      }

      // Fetch subscription
      const subResponse = await fetch(
        `/api/platform/billing/subscription?org_id=${organizationId}`
      );
      const subResult = await subResponse.json();
      if (subResult.data) {
        setSubscription(subResult.data);
      }
    } catch (error) {
      console.error('Error fetching billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalEstimatedCost = usageData.reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
  const metricsOverQuota = usageData.filter(item => item.is_over_quota).length;
  const currentMonthSpend = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total, 0);

  const handleUpgradePlan = () => {
    window.location.href = `/org/${organizationId}/billing/upgrade`;
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    window.open(`/api/platform/billing/invoices/${invoiceId}/pdf`, '_blank');
  };

  const handlePayInvoice = (invoiceId: string) => {
    window.location.href = `/billing/invoices/${invoiceId}/pay`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header with Currency Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Usage</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your subscription, view invoices, and monitor usage
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={currency === 'INR' ? 'primary' : 'outline'}
            onClick={() => setCurrency('INR')}
          >
            ₹ INR
          </Button>
          <Button
            variant={currency === 'USD' ? 'primary' : 'outline'}
            onClick={() => setCurrency('USD')}
          >
            $ USD
          </Button>
        </div>
      </div>

      {/* Current Plan Card */}
      {subscription && (
        <Card className="bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200">
          <Card.Content>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Text className="text-sm font-medium text-gray-500">Current Plan</Text>
                  <Badge color="green">Active</Badge>
                </div>
                <Text className="text-3xl font-bold text-gray-900">
                  {subscription.plan_display_name}
                </Text>
                <Text className="text-sm text-gray-600">
                  {formatCurrency(subscription.monthly_price, currency)}/month
                  {currency === 'INR' && ' + 18% GST'}
                </Text>
                <Text className="text-xs text-gray-500">
                  Billing period: {formatDateRange(subscription.current_period_start, subscription.current_period_end)}
                </Text>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.location.href = '/billing/plans'}>
                  Change Plan
                </Button>
                <Button onClick={handleUpgradePlan}>
                  Upgrade Plan
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Summary Cards */}
      <Grid cols={4} gap={4}>
        <UsageSummaryCard
          title="Current Month Spend"
          value={formatCurrency(currentMonthSpend, currency)}
          subtitle={selectedPeriod === 'current' ? 'This month' : 'Last month'}
          trend="+12% from last month"
          trendUp={false}
        />
        
        <UsageSummaryCard
          title="Estimated Overage"
          value={formatCurrency(totalEstimatedCost, currency)}
          subtitle="Based on current usage"
          trend={metricsOverQuota > 0 ? `${metricsOverQuota} metrics over quota` : 'Within limits'}
          trendUp={metricsOverQuota === 0}
        />
        
        <UsageSummaryCard
          title="Total Invoices"
          value={invoices.length.toString()}
          subtitle="Last 12 months"
          trend={`${invoices.filter(i => i.status === 'paid').length} paid`}
          trendUp={true}
        />
        
        <UsageSummaryCard
          title="Next Billing Date"
          value={format(new Date(), 'MMM dd, yyyy')}
          subtitle="Auto-renewal"
          trend={subscription?.status === 'active' ? 'Active subscription' : 'Action required'}
          trendUp={subscription?.status === 'active'}
        />
      </Grid>

      {/* Alerts */}
      {metricsOverQuota > 0 && (
        <Alert type="warning" title="Quota Exceeded">
          <div className="space-y-2">
            <p>
              You've exceeded your plan limits for {metricsOverQuota} metric(s). 
              This will result in additional charges of {formatCurrency(totalEstimatedCost, currency)}.
            </p>
            <Button size="sm" onClick={() => window.location.href = '/billing/usage'}>
              View Usage Details
            </Button>
          </div>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="usage">Usage Breakdown</Tabs.Trigger>
          <Tabs.Trigger value="invoices">Invoices</Tabs.Trigger>
          <Tabs.Trigger value="payment">Payment Methods</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview">
          <div className="grid grid-cols-2 gap-6">
            {/* Spending Trend */}
            <Card className="col-span-2">
              <Card.Header>
                <Card.Title>Spending Trend (Last 6 Months)</Card.Title>
              </Card.Header>
              <Card.Content>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={prepareSpendingData(invoices)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value, currency)}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#10B981" 
                      name="Total Spend"
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="base" 
                      stroke="#3B82F6" 
                      name="Base Plan"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="overage" 
                      stroke="#F59E0B" 
                      name="Overages"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card.Content>
            </Card>

            {/* Cost Breakdown */}
            <Card>
              <Card.Header>
                <Card.Title>Current Month Breakdown</Card.Title>
              </Card.Header>
              <Card.Content>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={prepareCostBreakdownData(usageData)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {prepareCostBreakdownData(usageData).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value, currency)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Card.Content>
            </Card>

            {/* Quota Utilization */}
            <Card>
              <Card.Header>
                <Card.Title>Quota Utilization</Card.Title>
              </Card.Header>
              <Card.Content className="space-y-4">
                {getTopQuotaMetrics(usageData).map((metric) => (
                  <div key={metric.metric_name}>
                    <div className="flex justify-between mb-1">
                      <Text className="font-medium">{formatMetricName(metric.metric_name)}</Text>
                      <Text className="text-sm text-gray-500">
                        {formatValue(metric.total_value, metric.unit)} / {formatValue(metric.quota_limit || 0, metric.unit)}
                      </Text>
                    </div>
                    <Progress
                      value={parseFloat(String(metric.quota_used_percentage))}
                      color={metric.is_over_quota ? 'red' : parseFloat(String(metric.quota_used_percentage)) > 80 ? 'yellow' : 'green'}
                    />
                    {metric.is_over_quota && (
                      <Badge color="red" className="mt-1">Over Quota</Badge>
                    )}
                  </div>
                ))}
              </Card.Content>
            </Card>
          </div>
        </Tabs.Content>

        <Tabs.Content value="usage">
          <UsageDetailTable 
            data={usageData}
            currency={currency}
          />
        </Tabs.Content>

        <Tabs.Content value="invoices">
          <InvoicesTable 
            invoices={invoices}
            currency={currency}
            onDownload={handleDownloadInvoice}
            onPay={handlePayInvoice}
          />
        </Tabs.Content>

        <Tabs.Content value="payment">
          <PaymentMethodsSection />
        </Tabs.Content>
      </Tabs>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface UsageSummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  trend: string;
  trendUp: boolean;
}

const UsageSummaryCard: React.FC<UsageSummaryCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendUp
}) => (
  <Card>
    <Card.Content>
      <div className="space-y-2">
        <Text className="text-sm font-medium text-gray-500">{title}</Text>
        <Text className="text-2xl font-bold">{value}</Text>
        <div className="flex justify-between items-center">
          <Text className="text-xs text-gray-500">{subtitle}</Text>
          <Badge color={trendUp ? 'green' : 'red'}>{trend}</Badge>
        </div>
      </div>
    </Card.Content>
  </Card>
);

interface UsageDetailTableProps {
  data: UsageData[];
  currency: string;
}

const UsageDetailTable: React.FC<UsageDetailTableProps> = ({ data, currency }) => (
  <Card>
    <Card.Header>
      <Card.Title>Detailed Usage Breakdown</Card.Title>
    </Card.Header>
    <Card.Content>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Metric</Table.Head>
            <Table.Head>Type</Table.Head>
            <Table.Head>Current Usage</Table.Head>
            <Table.Head>Quota Limit</Table.Head>
            <Table.Head>Usage %</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Est. Cost</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.map((row, index) => (
            <Table.Row key={index}>
              <Table.Cell>{formatMetricName(row.metric_name)}</Table.Cell>
              <Table.Cell className="capitalize">{row.metric_type}</Table.Cell>
              <Table.Cell>{formatValue(row.total_value, row.unit)}</Table.Cell>
              <Table.Cell>{formatValue(row.quota_limit || 0, row.unit)}</Table.Cell>
              <Table.Cell>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={parseFloat(String(row.quota_used_percentage))} 
                    className="w-24"
                    color={row.is_over_quota ? 'red' : 'blue'}
                  />
                  <Text className="text-sm">
                    {row.quota_used_percentage?.toFixed(1)}%
                  </Text>
                </div>
              </Table.Cell>
              <Table.Cell>
                {row.is_over_quota ? (
                  <Badge color="red">Over Quota</Badge>
                ) : (
                  <Badge color="green">Normal</Badge>
                )}
              </Table.Cell>
              <Table.Cell>
                {row.estimated_cost ? formatCurrency(row.estimated_cost, currency) : '-'}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Card.Content>
  </Card>
);

interface InvoicesTableProps {
  invoices: Invoice[];
  currency: string;
  onDownload: (invoiceId: string) => void;
  onPay: (invoiceId: string) => void;
}

const InvoicesTable: React.FC<InvoicesTableProps> = ({ invoices, currency, onDownload, onPay }) => (
  <Card>
    <Card.Header>
      <Card.Title>Billing History</Card.Title>
    </Card.Header>
    <Card.Content>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Invoice Number</Table.Head>
            <Table.Head>Date</Table.Head>
            <Table.Head>Billing Period</Table.Head>
            <Table.Head>Amount</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {invoices.map((invoice) => (
            <Table.Row key={invoice.invoice_id}>
              <Table.Cell className="font-medium">{invoice.invoice_number}</Table.Cell>
              <Table.Cell>{formatDate(invoice.invoice_date)}</Table.Cell>
              <Table.Cell>{formatDateRange(invoice.period_start, invoice.period_end)}</Table.Cell>
              <Table.Cell className="font-semibold">
                {formatCurrency(invoice.total, currency)}
              </Table.Cell>
              <Table.Cell>
                <Badge 
                  color={
                    invoice.status === 'paid' ? 'green' : 
                    invoice.status === 'pending' ? 'yellow' : 'red'
                  }
                >
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => onDownload(invoice.invoice_id)}
                  >
                    Download PDF
                  </Button>
                  {invoice.status !== 'paid' && (
                    <Button 
                      size="sm"
                      onClick={() => onPay(invoice.invoice_id)}
                    >
                      Pay Now
                    </Button>
                  )}
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Card.Content>
  </Card>
);

const PaymentMethodsSection: React.FC = () => (
  <Card>
    <Card.Header>
      <Card.Title>Payment Methods</Card.Title>
    </Card.Header>
    <Card.Content>
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Icon name="credit-card" className="w-8 h-8 text-blue-500" />
            <div>
              <Text className="font-medium">HDFC Bank •••• 1234</Text>
              <Text className="text-sm text-gray-500">Expires 12/2025</Text>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge color="green">Default</Badge>
            <Button size="sm" variant="outline">Edit</Button>
            <Button size="sm" variant="outline">Remove</Button>
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <Icon name="smartphone" className="w-8 h-8 text-green-500" />
            <div>
              <Text className="font-medium">UPI: customer@oksbi</Text>
              <Text className="text-sm text-gray-500">Google Pay</Text>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">Edit</Button>
            <Button size="sm" variant="outline">Remove</Button>
          </div>
        </div>

        <Button variant="outline" className="w-full">
          <Icon name="plus" className="w-4 h-4 mr-2" />
          Add Payment Method
        </Button>

        {currency === 'INR' && (
          <Alert type="info" title="Supported Payment Methods">
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>UPI (Google Pay, PhonePe, Paytm, BHIM)</li>
              <li>Credit/Debit Cards (RuPay, Visa, Mastercard)</li>
              <li>Net Banking (all major Indian banks)</li>
              <li>Digital Wallets (Paytm, MobiKwik, FreeCharge)</li>
              <li>EMI options available for annual plans</li>
            </ul>
          </Alert>
        )}
      </div>
    </Card.Content>
  </Card>
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getCurrencyConfig(currency: string) {
  const configs: Record<string, { symbol: string; locale: string; name: string }> = {
    INR: { symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
    USD: { symbol: '$', locale: 'en-US', name: 'US Dollar' },
    EUR: { symbol: '€', locale: 'de-DE', name: 'Euro' },
    GBP: { symbol: '£', locale: 'en-GB', name: 'British Pound' }
  };
  return configs[currency] || configs.INR;
}

function formatCurrency(amount: number, currency: string): string {
  const config = getCurrencyConfig(currency);
  
  if (currency === 'INR') {
    // Indian numbering system (lakhs and crores)
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
  }
  
  return `${config.symbol}${amount.toLocaleString(config.locale, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

function formatValue(value: number, unit: string): string {
  if (unit === 'bytes') {
    const gb = value / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = value / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    const kb = value / 1024;
    return `${kb.toFixed(2)} KB`;
  }
  if (unit === 'count') {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  }
  return `${value.toLocaleString()} ${unit}`;
}

function formatMetricName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
  }
  
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function getTopQuotaMetrics(data: UsageData[]): UsageData[] {
  return data
    .filter(item => item.quota_limit && item.quota_limit > 0)
    .sort((a, b) => parseFloat(String(b.quota_used_percentage)) - parseFloat(String(a.quota_used_percentage)))
    .slice(0, 5);
}

function prepareSpendingData(invoices: Invoice[]) {
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), 5 - i);
    return {
      month: format(date, 'MMM yyyy'),
      total: 0,
      base: 0,
      overage: 0
    };
  });

  invoices.forEach(invoice => {
    const monthKey = format(new Date(invoice.invoice_date), 'MMM yyyy');
    const monthData = last6Months.find(m => m.month === monthKey);
    if (monthData) {
      monthData.total += invoice.total;
      monthData.base += invoice.subtotal - invoice.tax;
      monthData.overage += invoice.tax;
    }
  });

  return last6Months;
}

function prepareCostBreakdownData(usageData: UsageData[]) {
  const costByType = usageData.reduce((acc, item) => {
    const cost = item.estimated_cost || 0;
    if (cost > 0) {
      acc[item.metric_type] = (acc[item.metric_type] || 0) + cost;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(costByType).map(([name, value]) => ({
    name: formatMetricName(name),
    value
  }));
}

export default BillingDashboard;
