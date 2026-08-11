import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('pocketbase-managed');

export type ServerEnv = Record<string, string | undefined>;

export type ManagedPocketBaseConfig = {
  publicUrl: string;
  adminUrl: string;
  adminEmail: string;
  adminPassword: string;
};

export type PocketBaseFieldInput = {
  name: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
};

function readEnv(env: ServerEnv | undefined, key: string): string | undefined {
  const fromContext = env?.[key]?.trim();
  if (fromContext) {
    return fromContext;
  }

  if (typeof process !== 'undefined' && process.env?.[key]) {
    const value = process.env[key]?.trim();
    return value || undefined;
  }

  return undefined;
}

export function getManagedPocketBaseConfig(env?: ServerEnv): ManagedPocketBaseConfig | null {
  const publicUrl = (readEnv(env, 'POCKETBASE_PUBLIC_URL') || readEnv(env, 'POCKETBASE_URL') || '').replace(
    /\/+$/,
    '',
  );
  const adminUrl = (
    readEnv(env, 'POCKETBASE_ADMIN_URL') ||
    readEnv(env, 'POCKETBASE_URL') ||
    publicUrl
  ).replace(/\/+$/, '');
  const adminEmail = readEnv(env, 'POCKETBASE_ADMIN_EMAIL');
  const adminPassword = readEnv(env, 'POCKETBASE_ADMIN_PASSWORD');

  if (!publicUrl || !adminUrl || !adminEmail || !adminPassword) {
    return null;
  }

  return { publicUrl, adminUrl, adminEmail, adminPassword };
}

export function isManagedPocketBaseConfigured(env?: ServerEnv): boolean {
  return Boolean(getManagedPocketBaseConfig(env));
}

export function createPocketBaseAppId(seed?: string): string {
  const source =
    seed?.trim() ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const cleaned = source.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^[a-z][a-z0-9]{5,15}$/.test(cleaned)) {
    return cleaned.slice(0, 16);
  }
  // Hash long/odd seeds so emails don't collide on short prefixes.
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  const hex = hash.toString(16).padStart(8, '0').slice(0, 10);
  const prefix = (cleaned.slice(0, 4) || 'app').replace(/^[^a-z]+/, '') || 'app';
  return `${prefix}${hex}`.slice(0, 14);
}

export function sanitizePocketBaseAppId(raw: string): string {
  return createPocketBaseAppId(raw);
}

export function physicalCollectionName(appId: string, logicalName: string): string {
  const safeLogical = logicalName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  const base = safeLogical || 'items';
  // PocketBase collection names: start with letter, max ~255
  return `ib_${appId}_${base}`.slice(0, 100);
}

async function adminAuth(config: ManagedPocketBaseConfig): Promise<string> {
  const attempts = [
    `${config.adminUrl}/api/collections/_superusers/auth-with-password`,
    `${config.adminUrl}/api/admins/auth-with-password`,
  ];

  let lastError = 'Indobase backend admin auth failed';

  for (const endpoint of attempts) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: config.adminEmail,
          password: config.adminPassword,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        token?: string;
        message?: string;
      };

      if (response.ok && payload.token) {
        return payload.token;
      }

      lastError = payload.message || `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

export async function probeManagedPocketBase(env?: ServerEnv): Promise<{ ok: boolean; url?: string; message?: string }> {
  const config = getManagedPocketBaseConfig(env);

  if (!config) {
    return {
      ok: false,
      message: 'Indobase backend is not configured.',
    };
  }

  try {
    const response = await fetch(`${config.adminUrl}/api/health`, { method: 'GET' });

    if (!response.ok) {
      return { ok: false, url: config.publicUrl, message: `Backend health check failed (${response.status})` };
    }

    await adminAuth(config);

    return { ok: true, url: config.publicUrl };
  } catch (error) {
    return {
      ok: false,
      url: config.publicUrl,
      message: error instanceof Error ? error.message : 'Indobase backend unreachable',
    };
  }
}

export type EnsureManagedPocketBaseResult = {
  ok: true;
  url: string;
  appId: string;
};

export async function ensureManagedPocketBase(options: {
  env?: ServerEnv;
  appId?: string;
  seed?: string;
}): Promise<EnsureManagedPocketBaseResult> {
  const config = getManagedPocketBaseConfig(options.env);

  if (!config) {
    throw new Error('Indobase backend is not configured.');
  }

  const health = await fetch(`${config.adminUrl}/api/health`).catch(() => null);

  if (!health?.ok) {
    throw new Error('Indobase backend is unreachable.');
  }

  // Verify admin credentials once so later schema tools do not surprise-fail.
  await adminAuth(config);

  const appId = options.appId?.trim()
    ? sanitizePocketBaseAppId(options.appId)
    : createPocketBaseAppId(options.seed);

  logger.info(`Ensured managed backend appId=${appId} url=${config.publicUrl}`);

  return {
    ok: true,
    url: config.publicUrl,
    appId,
  };
}

function mapField(field: PocketBaseFieldInput) {
  const name = field.name.trim();
  const type = field.type.trim() || 'text';

  return {
    name,
    type,
    required: Boolean(field.required),
    ...(field.options ? { options: field.options } : {}),
  };
}

export async function ensurePocketBaseCollection(options: {
  env?: ServerEnv;
  appId: string;
  name: string;
  type?: 'base' | 'auth' | 'view';
  fields?: PocketBaseFieldInput[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
}): Promise<{ name: string; logicalName: string; id?: string; created: boolean }> {
  const config = getManagedPocketBaseConfig(options.env);

  if (!config) {
    throw new Error('Indobase backend is not configured');
  }

  const token = await adminAuth(config);
  const logicalName = options.name.trim();
  const collectionName = physicalCollectionName(options.appId, logicalName);
  const fields = (options.fields || []).filter((field) => field.name?.trim()).map(mapField);

  const listResponse = await fetch(`${config.adminUrl}/api/collections?page=1&perPage=200`, {
    headers: { Authorization: token },
  });

  const listPayload = (await listResponse.json().catch(() => ({}))) as {
    items?: Array<{ id: string; name: string }>;
  };

  const existing = listPayload.items?.find((item) => item.name === collectionName);

  if (existing) {
    return {
      name: collectionName,
      logicalName,
      id: existing.id,
      created: false,
    };
  }

  const body = {
    name: collectionName,
    type: options.type || 'base',
    fields,
    listRule: options.listRule ?? '',
    viewRule: options.viewRule ?? '',
    createRule: options.createRule ?? '',
    updateRule: options.updateRule ?? '',
    deleteRule: options.deleteRule ?? '',
  };

  const createResponse = await fetch(`${config.adminUrl}/api/collections`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const createPayload = (await createResponse.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    message?: string;
    data?: unknown;
  };

  if (!createResponse.ok) {
    throw new Error(createPayload.message || `Failed to create collection ${collectionName}`);
  }

  return {
    name: createPayload.name || collectionName,
    logicalName,
    id: createPayload.id,
    created: true,
  };
}

export async function listPocketBaseCollections(options: {
  env?: ServerEnv;
  appId: string;
}): Promise<Array<{ name: string; logicalName: string; id: string; type?: string }>> {
  const config = getManagedPocketBaseConfig(options.env);

  if (!config) {
    throw new Error('Indobase backend is not configured');
  }

  const token = await adminAuth(config);
  const prefix = `ib_${options.appId}_`;

  const response = await fetch(`${config.adminUrl}/api/collections?page=1&perPage=200`, {
    headers: { Authorization: token },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    items?: Array<{ id: string; name: string; type?: string }>;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || 'Failed to list collections');
  }

  return (payload.items || [])
    .filter((item) => item.name.startsWith(prefix))
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      logicalName: item.name.slice(prefix.length),
    }));
}
