export interface ConnectionStatus {
  connected: boolean;
  latency: number;
  lastChecked: string;
}

const PROBE_TIMEOUT_MS = 5_000;

async function probeEndpoint(endpoint: string): Promise<{ ok: boolean; latency: number }> {
  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal,
    });
    const latency = Math.round(performance.now() - start);

    return { ok: response.ok || response.status === 204 || response.status === 304, latency };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const checkConnection = async (): Promise<ConnectionStatus> => {
  const lastChecked = new Date().toISOString();

  // Prefer real reachability probes. navigator.onLine alone is unreliable
  // (sleep/wake, VPN flaps) and previously caused false "Connection lost" banners.
  const endpoints = ['/api/health', '/', '/favicon.ico'];

  for (const endpoint of endpoints) {
    try {
      const result = await probeEndpoint(endpoint);

      if (result.ok) {
        return {
          connected: true,
          latency: result.latency,
          lastChecked,
        };
      }
    } catch (endpointError) {
      console.debug(`Failed to connect to ${endpoint}:`, endpointError);
    }
  }

  // Soft offline hint only after probes fail.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      connected: false,
      latency: 0,
      lastChecked,
    };
  }

  return {
    connected: false,
    latency: 0,
    lastChecked,
  };
};
