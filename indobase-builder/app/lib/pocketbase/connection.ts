import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

export function normalizePocketBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function isValidPocketBaseUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(normalizePocketBaseUrl(url));
}

export function hasPocketBaseConnection(
  connection?: IndobaseConnectionState | null,
): connection is IndobaseConnectionState {
  const url = connection?.pocketbase?.url?.trim();

  return Boolean(
    connection?.isConnected &&
      url &&
      (connection.backendProvider === 'pocketbase' || connection.connectionSource === 'pocketbase'),
  );
}

export function getPocketBaseUrl(connection?: IndobaseConnectionState | null): string | undefined {
  const url = connection?.pocketbase?.url?.trim();
  return url || undefined;
}
