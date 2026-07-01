export const INDOBASE_CONNECTION_STORAGE_KEY = 'indobase_connection';
export const INDOBASE_CREDENTIALS_STORAGE_KEY = 'indobase_credentials';
export const INDOBASE_PROJECT_CHAT_PREFIX = 'indobase-project-';
export const INDOBASE_CONNECTION_CHANGED_EVENT = 'indobase:connection-changed';
export const OPEN_INDOBASE_CONNECTION_EVENT = 'open-indobase-connection';

const LEGACY_CONNECTION_KEY = 'supabase_connection';
const LEGACY_CREDENTIALS_KEY = 'supabaseCredentials';
const LEGACY_PROJECT_PREFIX = 'supabase-project-';
const LEGACY_CONNECTION_CHANGED_EVENT = 'indobase:supabase-connection-changed';
const LEGACY_OPEN_CONNECTION_EVENT = 'open-supabase-connection';

function getStorage() {
  return typeof globalThis !== 'undefined' &&
    typeof globalThis.localStorage !== 'undefined' &&
    typeof globalThis.localStorage.getItem === 'function'
    ? globalThis.localStorage
    : null;
}

export function readStoredConnectionRaw(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const current = storage.getItem(INDOBASE_CONNECTION_STORAGE_KEY);
  if (current) {
    return current;
  }

  const legacy = storage.getItem(LEGACY_CONNECTION_KEY);
  if (!legacy) {
    return null;
  }

  storage.setItem(INDOBASE_CONNECTION_STORAGE_KEY, legacy);
  storage.removeItem(LEGACY_CONNECTION_KEY);
  return legacy;
}

export function readStoredCredentialsRaw(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const current = storage.getItem(INDOBASE_CREDENTIALS_STORAGE_KEY);
  if (current) {
    return current;
  }

  const legacy = storage.getItem(LEGACY_CREDENTIALS_KEY);
  if (!legacy) {
    return null;
  }

  storage.setItem(INDOBASE_CREDENTIALS_STORAGE_KEY, legacy);
  storage.removeItem(LEGACY_CREDENTIALS_KEY);
  return legacy;
}

export function writeStoredConnectionRaw(value: string) {
  const storage = getStorage();
  storage?.setItem(INDOBASE_CONNECTION_STORAGE_KEY, value);
  storage?.removeItem(LEGACY_CONNECTION_KEY);
}

export function writeStoredCredentialsRaw(value: string) {
  const storage = getStorage();
  storage?.setItem(INDOBASE_CREDENTIALS_STORAGE_KEY, value);
  storage?.removeItem(LEGACY_CREDENTIALS_KEY);
}

export function clearStoredConnection() {
  const storage = getStorage();
  storage?.removeItem(INDOBASE_CONNECTION_STORAGE_KEY);
  storage?.removeItem(LEGACY_CONNECTION_KEY);
  storage?.removeItem(INDOBASE_CREDENTIALS_STORAGE_KEY);
  storage?.removeItem(LEGACY_CREDENTIALS_KEY);
}

export function getChatProjectStorageKey(chatId: string) {
  return `${INDOBASE_PROJECT_CHAT_PREFIX}${chatId}`;
}

export function readChatProjectId(chatId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getChatProjectStorageKey(chatId);
  const current = window.localStorage.getItem(key);
  if (current) {
    return current;
  }

  const legacyKey = `${LEGACY_PROJECT_PREFIX}${chatId}`;
  const legacy = window.localStorage.getItem(legacyKey);
  if (!legacy) {
    return null;
  }

  window.localStorage.setItem(key, legacy);
  window.localStorage.removeItem(legacyKey);
  return legacy;
}

export function writeChatProjectId(chatId: string, projectId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getChatProjectStorageKey(chatId), projectId);
  window.localStorage.removeItem(`${LEGACY_PROJECT_PREFIX}${chatId}`);
}

export function clearChatProjectId(chatId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getChatProjectStorageKey(chatId));
  window.localStorage.removeItem(`${LEGACY_PROJECT_PREFIX}${chatId}`);
}

export function dispatchIndobaseConnectionChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(INDOBASE_CONNECTION_CHANGED_EVENT));
}

export function bindOpenIndobaseConnectionListener(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const wrapped = () => handler();
  window.addEventListener(OPEN_INDOBASE_CONNECTION_EVENT, wrapped);
  window.addEventListener(LEGACY_OPEN_CONNECTION_EVENT, wrapped);

  return () => {
    window.removeEventListener(OPEN_INDOBASE_CONNECTION_EVENT, wrapped);
    window.removeEventListener(LEGACY_OPEN_CONNECTION_EVENT, wrapped);
  };
}

export function bindIndobaseConnectionChangedListener(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const wrapped = () => handler();
  window.addEventListener(INDOBASE_CONNECTION_CHANGED_EVENT, wrapped);
  window.addEventListener(LEGACY_CONNECTION_CHANGED_EVENT, wrapped);

  return () => {
    window.removeEventListener(INDOBASE_CONNECTION_CHANGED_EVENT, wrapped);
    window.removeEventListener(LEGACY_CONNECTION_CHANGED_EVENT, wrapped);
  };
}
