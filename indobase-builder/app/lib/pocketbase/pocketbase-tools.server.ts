import { tool } from 'ai';
import { z } from 'zod';
import {
  ensureManagedPocketBase,
  ensurePocketBaseCollection,
  listPocketBaseCollections,
  probeManagedPocketBase,
  type ServerEnv,
} from '~/lib/pocketbase/managed.server';

const fieldSchema = z.object({
  name: z.string().min(1).describe('Field name, e.g. title'),
  type: z
    .string()
    .min(1)
    .describe('Field type: text, number, bool, email, url, date, select, file, relation, json, editor'),
  required: z.boolean().optional(),
});

/** Agent tools for the managed Indobase backend (engine name never exposed to users). */
export function createManagedPocketBaseTools(options: {
  env?: ServerEnv;
  appId: string;
}) {
  const { env, appId } = options;

  return {
    indobase_backend_health: tool({
      description: 'Check that the managed Indobase backend for this Builder session is healthy.',
      parameters: z.object({}),
      execute: async () => probeManagedPocketBase(env),
    }),
    indobase_ensure_backend: tool({
      description:
        'Ensure the managed Indobase backend is ready for this app. Call before creating collections. Do not ask the user for URLs or credentials.',
      parameters: z.object({}),
      execute: async () => ensureManagedPocketBase({ env, appId }),
    }),
    indobase_list_collections: tool({
      description: 'List Indobase backend collections already provisioned for this Builder app.',
      parameters: z.object({}),
      execute: async () => ({
        collections: await listPocketBaseCollections({ env, appId }),
      }),
    }),
    indobase_ensure_collection: tool({
      description:
        'Create (or reuse) an Indobase backend collection for this app. Always call this BEFORE wiring frontend CRUD. Use the returned `name` in indobase.collection(name). Never ask the user to open any admin UI.',
      parameters: z.object({
        name: z
          .string()
          .min(1)
          .describe('Logical collection name, e.g. posts or tasks (do not include app prefix)'),
        type: z.enum(['base', 'auth']).optional().describe('Usually base; use auth only for custom auth collections'),
        fields: z.array(fieldSchema).optional().describe('Fields to create on a new collection'),
        listRule: z.string().nullable().optional(),
        viewRule: z.string().nullable().optional(),
        createRule: z.string().nullable().optional(),
        updateRule: z.string().nullable().optional(),
        deleteRule: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        ensurePocketBaseCollection({
          env,
          appId,
          name: input.name,
          type: input.type || 'base',
          fields: input.fields,
          listRule: input.listRule,
          viewRule: input.viewRule,
          createRule: input.createRule,
          updateRule: input.updateRule,
          deleteRule: input.deleteRule,
        }),
    }),
  };
}
