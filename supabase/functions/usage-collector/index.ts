// Usage Tracking Collection Service
// This Edge Function collects usage metrics from various services

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UsageMetric {
  project_id: string;
  organization_id: string;
  metric_type: 'database' | 'auth' | 'storage' | 'functions' | 'realtime';
  metric_name: string;
  metric_value: number;
  unit: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

interface UsageCollector {
  collect(): Promise<UsageMetric[]>;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get query parameters
    const url = new URL(req.url);
    const collectorType = url.searchParams.get('type'); // database, auth, storage, functions, realtime, all
    const projectRef = url.searchParams.get('project_ref');

    let metrics: UsageMetric[] = [];

    if (collectorType === 'all' || !collectorType) {
      // Collect all metrics
      const collectors = [
        new DatabaseUsageCollector(supabaseClient, projectRef),
        new AuthUsageCollector(supabaseClient, projectRef),
        new StorageUsageCollector(supabaseClient, projectRef),
        new FunctionsUsageCollector(supabaseClient, projectRef),
        new RealtimeUsageCollector(supabaseClient, projectRef),
      ];

      const results = await Promise.allSettled(
        collectors.map(collector => collector.collect())
      );

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          metrics = [...metrics, ...result.value];
        }
      });
    } else {
      // Collect specific metric type
      const collector = getCollector(collectorType, supabaseClient, projectRef);
      if (collector) {
        metrics = await collector.collect();
      }
    }

    // Store metrics in database
    if (metrics.length > 0) {
      const { error } = await supabaseClient
        .from('usage_metrics')
        .insert(metrics);

      if (error) {
        console.error('Error storing metrics:', error);
        throw error;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: metrics.length,
        metrics: metrics.slice(0, 10) // Return first 10 for preview
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error collecting usage:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function getCollector(type: string, supabaseClient: any, projectRef: string | null): UsageCollector | null {
  switch (type) {
    case 'database':
      return new DatabaseUsageCollector(supabaseClient, projectRef);
    case 'auth':
      return new AuthUsageCollector(supabaseClient, projectRef);
    case 'storage':
      return new StorageUsageCollector(supabaseClient, projectRef);
    case 'functions':
      return new FunctionsUsageCollector(supabaseClient, projectRef);
    case 'realtime':
      return new RealtimeUsageCollector(supabaseClient, projectRef);
    default:
      return null;
  }
}

// ============================================================================
// DATABASE USAGE COLLECTOR
// ============================================================================

class DatabaseUsageCollector implements UsageCollector {
  constructor(private supabase: any, private projectRef: string | null) {}

  async collect(): Promise<UsageMetric[]> {
    const metrics: UsageMetric[] = [];

    try {
      // 1. Database size
      const sizeQuery = `
        SELECT SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) AS total_size
        FROM pg_tables
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
      `;

      const { data: sizeData } = await this.supabase.rpc('exec_sql', { sql: sizeQuery });
      const databaseSize = sizeData?.[0]?.total_size || 0;

      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'database',
        metric_name: 'database_size',
        metric_value: databaseSize,
        unit: 'bytes',
        metadata: { schema_breakdown: await this.getSchemaBreakdown() }
      });

      // 2. API requests (from logs or Kong metrics)
      const requestCount = await this.getApiRequestCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'database',
        metric_name: 'api_requests',
        metric_value: requestCount,
        unit: 'count',
        metadata: { period: 'hourly' }
      });

      // 3. Active connections
      const connections = await this.getActiveConnections();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'database',
        metric_name: 'active_connections',
        metric_value: connections,
        unit: 'count',
        metadata: { max_connections: 100 }
      });

    } catch (error) {
      console.error('Error collecting database metrics:', error);
    }

    return metrics;
  }

  private async getProjectId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('id')
      .eq('ref', this.projectRef)
      .single();
    return data?.id;
  }

  private async getOrganizationId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('organization_id')
      .eq('ref', this.projectRef)
      .single();
    return data?.organization_id;
  }

  private async getSchemaBreakdown(): Promise<Record<string, number>> {
    // Implementation for getting size per schema
    return {};
  }

  private async getApiRequestCount(): Promise<number> {
    // Query Kong logs or API gateway metrics
    // This is a placeholder - implement based on your logging setup
    return 0;
  }

  private async getActiveConnections(): Promise<number> {
    const { data } = await this.supabase.rpc('exec_sql', {
      sql: 'SELECT count(*) FROM pg_stat_activity WHERE state = \'active\''
    });
    return parseInt(data?.[0]?.count || '0');
  }
}

// ============================================================================
// AUTH USAGE COLLECTOR
// ============================================================================

class AuthUsageCollector implements UsageCollector {
  constructor(private supabase: any, private projectRef: string | null) {}

  async collect(): Promise<UsageMetric[]> {
    const metrics: UsageMetric[] = [];

    try {
      // 1. Total users
      const { count: totalUsers } = await this.supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1
      });

      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'auth',
        metric_name: 'total_users',
        metric_value: totalUsers || 0,
        unit: 'count',
        metadata: {}
      });

      // 2. Monthly Active Users (MAU)
      const mau = await this.calculateMAU();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'auth',
        metric_name: 'mau',
        metric_value: mau,
        unit: 'count',
        metadata: { period: 'monthly' }
      });

      // 3. Sign-ins this month
      const signInCount = await this.getSignInCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'auth',
        metric_name: 'sign_ins',
        metric_value: signInCount,
        unit: 'count',
        metadata: { period: 'monthly' }
      });

      // 4. MFA users
      const mfaCount = await this.getMFAUserCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'auth',
        metric_name: 'mfa_users',
        metric_value: mfaCount,
        unit: 'count',
        metadata: {}
      });

    } catch (error) {
      console.error('Error collecting auth metrics:', error);
    }

    return metrics;
  }

  private async getProjectId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('id')
      .eq('ref', this.projectRef)
      .single();
    return data?.id;
  }

  private async getOrganizationId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('organization_id')
      .eq('ref', this.projectRef)
      .single();
    return data?.organization_id;
  }

  private async calculateMAU(): Promise<number> {
    // Count users who logged in within the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: sessions } = await this.supabase
      .from('sessions')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Alternatively, query auth logs
    return 0; // Placeholder
  }

  private async getSignInCount(): Promise<number> {
    // Query sign-in events from auth logs
    return 0; // Placeholder
  }

  private async getMFAUserCount(): Promise<number> {
    const { data: users } = await this.supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    const mfaUsers = users?.filter(user => user.factors?.some(f => f.status === 'verified')).length || 0;
    return mfaUsers;
  }
}

// ============================================================================
// STORAGE USAGE COLLECTOR
// ============================================================================

class StorageUsageCollector implements UsageCollector {
  constructor(private supabase: any, private projectRef: string | null) {}

  async collect(): Promise<UsageMetric[]> {
    const metrics: UsageMetric[] = [];

    try {
      // 1. Total storage size
      const { data: buckets } = await this.supabase.storage.listBuckets();
      
      let totalSize = 0;
      const bucketBreakdown: Record<string, number> = {};

      for (const bucket of buckets || []) {
        const { data: objects } = await this.supabase.storage
          .from(bucket.id)
          .list('', { limit: 1000 });

        const bucketSize = objects?.reduce((sum, obj) => sum + (obj.metadata?.size || 0), 0) || 0;
        bucketBreakdown[bucket.id] = bucketSize;
        totalSize += bucketSize;
      }

      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'storage',
        metric_name: 'storage_size',
        metric_value: totalSize,
        unit: 'bytes',
        metadata: { bucket_breakdown: bucketBreakdown }
      });

      // 2. Total objects count
      const totalObjects = Object.keys(bucketBreakdown).reduce(
        (sum, bucketId) => sum + (bucketBreakdown[bucketId] ? 1 : 0), 
        0
      );

      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'storage',
        metric_name: 'object_count',
        metric_value: totalObjects,
        unit: 'count',
        metadata: {}
      });

      // 3. Egress (bandwidth used)
      const egressBytes = await this.getEgressBytes();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'storage',
        metric_name: 'egress_bytes',
        metric_value: egressBytes,
        unit: 'bytes',
        metadata: { period: 'monthly' }
      });

      // 4. Image transformations
      const transformationCount = await this.getTransformationCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'storage',
        metric_name: 'image_transformations',
        metric_value: transformationCount,
        unit: 'count',
        metadata: { period: 'monthly' }
      });

    } catch (error) {
      console.error('Error collecting storage metrics:', error);
    }

    return metrics;
  }

  private async getProjectId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('id')
      .eq('ref', this.projectRef)
      .single();
    return data?.id;
  }

  private async getOrganizationId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('organization_id')
      .eq('ref', this.projectRef)
      .single();
    return data?.organization_id;
  }

  private async getEgressBytes(): Promise<number> {
    // Query CDN or storage egress logs
    return 0; // Placeholder
  }

  private async getTransformationCount(): Promise<number> {
    // Query image transformation service logs
    return 0; // Placeholder
  }
}

// ============================================================================
// FUNCTIONS USAGE COLLECTOR
// ============================================================================

class FunctionsUsageCollector implements UsageCollector {
  constructor(private supabase: any, private projectRef: string | null) {}

  async collect(): Promise<UsageMetric[]> {
    const metrics: UsageMetric[] = [];

    try {
      // 1. Total invocations
      const invocationCount = await this.getInvocationCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'functions',
        metric_name: 'invocations',
        metric_value: invocationCount,
        unit: 'count',
        metadata: { period: 'monthly' }
      });

      // 2. Total compute duration
      const computeDuration = await this.getComputeDuration();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'functions',
        metric_name: 'compute_duration',
        metric_value: computeDuration,
        unit: 'milliseconds',
        metadata: { period: 'monthly' }
      });

      // 3. Breakdown by function
      const functionBreakdown = await this.getFunctionBreakdown();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'functions',
        metric_name: 'invocations_by_function',
        metric_value: Object.values(functionBreakdown).reduce((a, b) => a + b, 0),
        unit: 'count',
        metadata: { breakdown: functionBreakdown }
      });

    } catch (error) {
      console.error('Error collecting functions metrics:', error);
    }

    return metrics;
  }

  private async getProjectId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('id')
      .eq('ref', this.projectRef)
      .single();
    return data?.id;
  }

  private async getOrganizationId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('organization_id')
      .eq('ref', this.projectRef)
      .single();
    return data?.organization_id;
  }

  private async getInvocationCount(): Promise<number> {
    // Query edge function logs or runtime metrics
    return 0; // Placeholder
  }

  private async getComputeDuration(): Promise<number> {
    // Sum of execution times across all functions
    return 0; // Placeholder
  }

  private async getFunctionBreakdown(): Promise<Record<string, number>> {
    // Group invocations by function name
    return {}; // Placeholder
  }
}

// ============================================================================
// REALTIME USAGE COLLECTOR
// ============================================================================

class RealtimeUsageCollector implements UsageCollector {
  constructor(private supabase: any, private projectRef: string | null) {}

  async collect(): Promise<UsageMetric[]> {
    const metrics: UsageMetric[] = [];

    try {
      // 1. Peak concurrent connections
      const peakConnections = await this.getPeakConnections();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'realtime',
        metric_name: 'peak_connections',
        metric_value: peakConnections,
        unit: 'count',
        metadata: { period: 'daily' }
      });

      // 2. Total messages sent
      const messageCount = await this.getMessageCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'realtime',
        metric_name: 'messages',
        metric_value: messageCount,
        unit: 'count',
        metadata: { period: 'monthly' }
      });

      // 3. Postgres changes subscribed
      const changesCount = await this.getPostgresChangesCount();
      metrics.push({
        project_id: await this.getProjectId(),
        organization_id: await this.getOrganizationId(),
        metric_type: 'realtime',
        metric_name: 'postgres_changes',
        metric_value: changesCount,
        unit: 'count',
        metadata: {}
      });

    } catch (error) {
      console.error('Error collecting realtime metrics:', error);
    }

    return metrics;
  }

  private async getProjectId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('id')
      .eq('ref', this.projectRef)
      .single();
    return data?.id;
  }

  private async getOrganizationId(): Promise<string> {
    if (!this.projectRef) throw new Error('Project ref required');
    const { data } = await this.supabase
      .from('projects')
      .select('organization_id')
      .eq('ref', this.projectRef)
      .single();
    return data?.organization_id;
  }

  private async getPeakConnections(): Promise<number> {
    // Query realtime server metrics
    return 0; // Placeholder
  }

  private async getMessageCount(): Promise<number> {
    // Count messages broadcast through realtime
    return 0; // Placeholder
  }

  private async getPostgresChangesCount(): Promise<number> {
    // Count active postgres change subscriptions
    return 0; // Placeholder
  }
}
