import { z } from 'zod';
declare const pgExtensionZod: z.ZodObject<{
    name: z.ZodString;
    schema: z.ZodNullable<z.ZodString>;
    default_version: z.ZodString;
    installed_version: z.ZodNullable<z.ZodString>;
    comment: z.ZodString;
}, "strip", z.ZodTypeAny, {
    schema: string | null;
    name: string;
    comment: string;
    default_version: string;
    installed_version: string | null;
}, {
    schema: string | null;
    name: string;
    comment: string;
    default_version: string;
    installed_version: string | null;
}>;
declare const pgExtensionArrayZod: z.ZodArray<z.ZodObject<{
    name: z.ZodString;
    schema: z.ZodNullable<z.ZodString>;
    default_version: z.ZodString;
    installed_version: z.ZodNullable<z.ZodString>;
    comment: z.ZodString;
}, "strip", z.ZodTypeAny, {
    schema: string | null;
    name: string;
    comment: string;
    default_version: string;
    installed_version: string | null;
}, {
    schema: string | null;
    name: string;
    comment: string;
    default_version: string;
    installed_version: string | null;
}>, "many">;
declare const pgExtensionOptionalZod: z.ZodOptional<z.ZodObject<{
    name: z.ZodString;
    schema: z.ZodNullable<z.ZodString>;
    default_version: z.ZodString;
    installed_version: z.ZodNullable<z.ZodString>;
    comment: z.ZodString;
}, "strip", z.ZodTypeAny, {
    schema: string | null;
    name: string;
    comment: string;
    default_version: string;
    installed_version: string | null;
}, {
    schema: string | null;
    name: string;
    comment: string;
    default_version: string;
    installed_version: string | null;
}>>;
export type PGExtension = z.infer<typeof pgExtensionZod>;
declare function list({ limit, offset, }?: {
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgExtensionArrayZod;
};
declare function retrieve({ name }: {
    name: string;
}): {
    sql: string;
    zod: typeof pgExtensionOptionalZod;
};
type ExtensionCreateParams = {
    name: string;
    schema?: string;
    version?: string;
    cascade?: boolean;
};
declare function create({ name, schema, version, cascade }: ExtensionCreateParams): {
    sql: string;
};
type ExtensionUpdateParams = {
    update?: boolean;
    version?: string;
    schema?: string;
};
declare function update(name: string, { update, version, schema }: ExtensionUpdateParams): {
    sql: string;
};
type ExtensionRemoveParams = {
    cascade?: boolean;
};
declare function remove(name: string, { cascade }?: ExtensionRemoveParams): {
    sql: string;
};
declare const _default: {
    list: typeof list;
    retrieve: typeof retrieve;
    create: typeof create;
    update: typeof update;
    remove: typeof remove;
    zod: z.ZodObject<{
        name: z.ZodString;
        schema: z.ZodNullable<z.ZodString>;
        default_version: z.ZodString;
        installed_version: z.ZodNullable<z.ZodString>;
        comment: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        schema: string | null;
        name: string;
        comment: string;
        default_version: string;
        installed_version: string | null;
    }, {
        schema: string | null;
        name: string;
        comment: string;
        default_version: string;
        installed_version: string | null;
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-extensions.d.ts.map