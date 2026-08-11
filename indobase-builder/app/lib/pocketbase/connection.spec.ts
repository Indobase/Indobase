import { describe, expect, it } from 'vitest';
import {
  getPocketBaseUrl,
  hasPocketBaseConnection,
  isValidPocketBaseUrl,
  normalizePocketBaseUrl,
} from './connection';
import type { IndobaseConnectionState } from '~/lib/stores/indobase-connection';

describe('pocketbase connection helpers', () => {
  it('normalizes trailing slashes', () => {
    expect(normalizePocketBaseUrl('https://pb.example.com/')).toBe('https://pb.example.com');
  });

  it('validates http(s) URLs', () => {
    expect(isValidPocketBaseUrl('https://pb.example.com')).toBe(true);
    expect(isValidPocketBaseUrl('not-a-url')).toBe(false);
  });

  it('detects a connected PocketBase session', () => {
    const connection = {
      isConnected: true,
      backendProvider: 'pocketbase',
      connectionSource: 'pocketbase',
      pocketbase: { url: 'https://pb.example.com' },
    } as IndobaseConnectionState;

    expect(hasPocketBaseConnection(connection)).toBe(true);
    expect(getPocketBaseUrl(connection)).toBe('https://pb.example.com');
  });

  it('rejects Indobase sessions', () => {
    const connection = {
      isConnected: true,
      backendProvider: 'indobase',
      connectionSource: 'manual',
      credentials: { apiUrl: 'https://x.indobase.in', anonKey: 'k' },
    } as IndobaseConnectionState;

    expect(hasPocketBaseConnection(connection)).toBe(false);
  });
});
