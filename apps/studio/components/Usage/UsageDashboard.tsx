import React, { useState, useEffect } from 'react';
import { Card, Text, Button, Grid, Badge, Progress, Table, Tabs, Icon } from '@ui-library/components';
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
import { format } from 'date-fns';

interface UsageData {
  metric_type: string;
  metric_name: string;
  total_value: number;
  unit: string;
  quota_limit?: number;
  quota_used_percentage?: number;
  is_over_quota?: boolean;
  estimated_cost?: number;
  day?: string;
  month?: string;
}

interface UsageDashboardProps {
  projectRef?: string;
  organizationId?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export const UsageDashboard: React.FC<UsageDashboardProps> = ({ 
  projectRef, 
  organizationId 
}) => {
  const [loading, setLoading] = useState(true);
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    fetchUsageData();
  }, [period, selectedMetric, startDate, endDate]);

  const fetchUsageData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period,
        include_quotas: 'true',
        include_costs: 'true'
      });

      if (projectRef) params.append('ref', projectRef);
      if (organizationId) params.append('org_id', organizationId);
      if (selectedMetric !== 'all') params.append('metric_name', selectedMetric);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await fetch(`/api/platform/usage/analytics?${params}`);
      const result = await response.json();
      
      if (result.data) {
        setUsageData(result.data);
      }
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch('/api/platform/usage/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: organizationId,
          format,
          period: 'monthly',
          month: format === 'csv' ? new Date().toISOString().slice(0, 7) : undefined
        })
      });

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage-${format(new Date(), 'yyyy-MM')}.${format}`;
        a.click();
      }
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  // Group data by metric type for display
  const groupedData = usageData.reduce((acc, item) => {
    if (!acc[item.metric_type]) {
      acc[item.metric_type] = [];
    }
    acc[item.metric_type].push(item);
    return acc;
  }, {} as Record<string, UsageData[]>);

  // Calculate totals
  const totalEstimatedCost = usageData.reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
  const metricsOverQuota = usageData.filter(item => item.is_over_quota).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage & Billing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor your resource consumption and estimated costs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')}>
            <Icon name="download" className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport('json')}>
            Export JSON
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <Grid cols={4} gap={4}>
        <UsageSummaryCard
          title="Total Estimated Cost"
          value={`$${totalEstimatedCost.toFixed(2)}`}
          subtitle="Current billing period"
          trend="+12% from last month"
          trendUp={true}
        />
        
        <UsageSummaryCard
          title="Metrics Over Quota"
          value={metricsOverQuota.toString()}
          subtitle="Requiring attention"
          trend={metricsOverQuota > 0 ? 'Action needed' : 'All within limits'}
          trendUp={metricsOverQuota === 0}
        />
        
        <UsageSummaryCard
          title="Total API Requests"
          value={formatNumber(getMetricTotal(usageData, 'api_requests'))}
          subtitle={period === 'daily' ? 'Today' : 'This month'}
          trend="+8% from previous period"
          trendUp={true}
        />
        
        <UsageSummaryCard
          title="Database Size"
          value={formatBytes(getMetricTotal(usageData, 'database_size'))}
          subtitle={`of ${formatBytes(getQuotaLimit(usageData, 'database_size'))} included`}
          trend={`${getQuotaPercentage(usageData, 'database_size')}% used`}
          trendUp={getQuotaPercentage(usageData, 'database_size') < 80}
        />
      </Grid>

      {/* Period Selector */}
      <div className="flex gap-2">
        <Button
          variant={period === 'daily' ? 'primary' : 'outline'}
          onClick={() => setPeriod('daily')}
        >
          Daily
        </Button>
        <Button
          variant={period === 'monthly' ? 'primary' : 'outline'}
          onClick={() => setPeriod('monthly')}
        >
          Monthly
        </Button>
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="database">Database</Tabs.Trigger>
          <Tabs.Trigger value="auth">Authentication</Tabs.Trigger>
          <Tabs.Trigger value="storage">Storage</Tabs.Trigger>
          <Tabs.Trigger value="functions">Functions</Tabs.Trigger>
          <Tabs.Trigger value="realtime">Realtime</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview">
          <div className="grid grid-cols-2 gap-6">
            {/* Usage Trend Chart */}
            <Card className="col-span-2">
              <Card.Header>
                <Card.Title>Usage Trends</Card.Title>
              </Card.Header>
              <Card.Content>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={prepareChartData(usageData)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="database_size" 
                      stroke="#8884d8" 
                      name="Database Size"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="api_requests" 
                      stroke="#82ca9d" 
                      name="API Requests"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="storage_size" 
                      stroke="#ffc658" 
                      name="Storage Size"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card.Content>
            </Card>

            {/* Cost Breakdown */}
            <Card>
              <Card.Header>
                <Card.Title>Cost Breakdown</Card.Title>
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
                    <Tooltip />
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

        <Tabs.Content value="database">
          <MetricDetailTable 
            data={groupedData['database'] || []}
            metricType="database"
          />
        </Tabs.Content>

        <Tabs.Content value="auth">
          <MetricDetailTable 
            data={groupedData['auth'] || []}
            metricType="auth"
          />
        </Tabs.Content>

        <Tabs.Content value="storage">
          <MetricDetailTable 
            data={groupedData['storage'] || []}
            metricType="storage"
          />
        </Tabs.Content>

        <Tabs.Content value="functions">
          <MetricDetailTable 
            data={groupedData['functions'] || []}
            metricType="functions"
          />
        </Tabs.Content>

        <Tabs.Content value="realtime">
          <MetricDetailTable 
            data={groupedData['realtime'] || []}
            metricType="realtime"
          />
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

interface MetricDetailTableProps {
  data: UsageData[];
  metricType: string;
}

const MetricDetailTable: React.FC<MetricDetailTableProps> = ({ data, metricType }) => (
  <Card>
    <Card.Header>
      <Card.Title>{formatMetricType(metricType)} Metrics</Card.Title>
    </Card.Header>
    <Card.Content>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>Metric</Table.Head>
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
              <Table.Cell>${row.estimated_cost?.toFixed(2) || '0.00'}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Card.Content>
  </Card>
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getMetricTotal(data: UsageData[], metricName: string): number {
  return data
    .filter(item => item.metric_name === metricName)
    .reduce((sum, item) => sum + item.total_value, 0);
}

function getQuotaLimit(data: UsageData[], metricName: string): number {
  const item = data.find(d => d.metric_name === metricName);
  return item?.quota_limit || 0;
}

function getQuotaPercentage(data: UsageData[], metricName: string): number {
  const item = data.find(d => d.metric_name === metricName);
  return parseFloat(String(item?.quota_used_percentage || 0));
}

function getTopQuotaMetrics(data: UsageData[]): UsageData[] {
  return data
    .filter(item => item.quota_limit && item.quota_limit > 0)
    .sort((a, b) => parseFloat(String(b.quota_used_percentage)) - parseFloat(String(a.quota_used_percentage)))
    .slice(0, 5);
}

function prepareChartData(data: UsageData[]): any[] {
  // Group by date and pivot metrics
  const grouped = data.reduce((acc, item) => {
    const date = item.day || item.month || 'N/A';
    if (!acc[date]) {
      acc[date] = { date };
    }
    acc[date][item.metric_name] = item.total_value;
    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

function prepareCostBreakdownData(data: UsageData[]): any[] {
  const costByType = data.reduce((acc, item) => {
    const cost = item.estimated_cost || 0;
    if (cost > 0) {
      acc[item.metric_type] = (acc[item.metric_type] || 0) + cost;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(costByType).map(([name, value]) => ({
    name: formatMetricType(name),
    value
  }));
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) {
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function formatValue(value: number, unit: string): string {
  if (unit === 'bytes') {
    return formatBytes(value);
  }
  if (unit === 'count' || unit === 'requests') {
    return formatNumber(value);
  }
  return `${value.toFixed(2)} ${unit}`;
}

function formatMetricType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatMetricName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default UsageDashboard;
