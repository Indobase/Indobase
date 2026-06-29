import { createClient } from '@indobaseinc/indobase-js';

const url = import.meta.env.VITE_INDOBASE_URL;
const anonKey = import.meta.env.VITE_INDOBASE_ANON_KEY;

export const hasIndobaseEnv = Boolean(url && anonKey);

export const indobase = hasIndobaseEnv ? createClient(url!, anonKey!) : null;

export function requireIndobase() {
  if (!indobase) {
    throw new Error('Missing VITE_INDOBASE_URL or VITE_INDOBASE_ANON_KEY. Link Builder from Studio or add a .env file.');
  }

  return indobase;
}
