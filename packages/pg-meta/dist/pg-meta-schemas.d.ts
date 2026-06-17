import { z } from 'zod';
declare const pgSchemaArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    owner: z.ZodString;
    comment: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: number;
    name: string;
    comment: string | null;
    owner: string;
}, {
    id: number;
    name: string;
    comment: string | null;
    owner: string;
}>, "many">;
declare const pgSchemaOptionalZod: z.ZodOptional<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    owner: z.ZodString;
    comment: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: number;
    name: string;
    comment: string | null;
    owner: string;
}, {
    id: number;
    name: string;
    comment: string | null;
    owner: string;
}>>;
declare function list({ includeSystemSchemas, limit, offset, }?: {
    includeSystemSchemas?: boolean;
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgSchemaArrayZod;
};
declare function retrieve({ id }: {
    id: number;
}): {
    sql: string;
    zod: typeof pgSchemaOptionalZod;
};
declare function retrieve({ name }: {
    name: string;
}): {
    sql: string;
    zod: typeof pgSchemaOptionalZod;
};
type SchemaCreateParams = {
    name: string;
    owner?: string;
};
declare function create({ name, owner }: SchemaCreateParams): {
    sql: string;
};
type SchemaUpdateParams = {
    name?: string;
    owner?: string;
};
declare function update({ id }: {
    id: number;
}, params: SchemaUpdateParams): {
    sql: string;
};
declare function update({ name }: {
    name: string;
}, params: SchemaUpdateParams): {
    sql: string;
};
type SchemaRemoveParams = {
    cascade?: boolean;
};
declare function remove({ id }: {
    id: number;
}, params?: SchemaRemoveParams): {
    sql: string;
};
declare function remove({ name }: {
    name: string;
}, params?: SchemaRemoveParams): {
    sql: string;
};
declare const _default: {
    list: typeof list;
    retrieve: typeof retrieve;
    create: typeof create;
    update: typeof update;
    remove: typeof remove;
    zod: z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        owner: z.ZodString;
        comment: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        name: string;
        comment: string | null;
        owner: string;
    }, {
        id: number;
        name: string;
        comment: string | null;
        owner: string;
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-schemas.d.ts.map