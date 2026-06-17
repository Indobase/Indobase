import { z } from 'zod';
declare const pgPublicationZod: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    owner: z.ZodString;
    publish_insert: z.ZodBoolean;
    publish_update: z.ZodBoolean;
    publish_delete: z.ZodBoolean;
    publish_truncate: z.ZodBoolean;
    tables: z.ZodNullable<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        name: z.ZodString;
        schema: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        schema: string;
        name: string;
        id?: number | undefined;
    }, {
        schema: string;
        name: string;
        id?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: number;
    name: string;
    owner: string;
    publish_insert: boolean;
    publish_update: boolean;
    publish_delete: boolean;
    publish_truncate: boolean;
    tables: {
        schema: string;
        name: string;
        id?: number | undefined;
    }[] | null;
}, {
    id: number;
    name: string;
    owner: string;
    publish_insert: boolean;
    publish_update: boolean;
    publish_delete: boolean;
    publish_truncate: boolean;
    tables: {
        schema: string;
        name: string;
        id?: number | undefined;
    }[] | null;
}>;
declare const pgPublicationArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    owner: z.ZodString;
    publish_insert: z.ZodBoolean;
    publish_update: z.ZodBoolean;
    publish_delete: z.ZodBoolean;
    publish_truncate: z.ZodBoolean;
    tables: z.ZodNullable<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        name: z.ZodString;
        schema: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        schema: string;
        name: string;
        id?: number | undefined;
    }, {
        schema: string;
        name: string;
        id?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: number;
    name: string;
    owner: string;
    publish_insert: boolean;
    publish_update: boolean;
    publish_delete: boolean;
    publish_truncate: boolean;
    tables: {
        schema: string;
        name: string;
        id?: number | undefined;
    }[] | null;
}, {
    id: number;
    name: string;
    owner: string;
    publish_insert: boolean;
    publish_update: boolean;
    publish_delete: boolean;
    publish_truncate: boolean;
    tables: {
        schema: string;
        name: string;
        id?: number | undefined;
    }[] | null;
}>, "many">;
declare const pgPublicationOptionalZod: z.ZodOptional<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    owner: z.ZodString;
    publish_insert: z.ZodBoolean;
    publish_update: z.ZodBoolean;
    publish_delete: z.ZodBoolean;
    publish_truncate: z.ZodBoolean;
    tables: z.ZodNullable<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        name: z.ZodString;
        schema: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        schema: string;
        name: string;
        id?: number | undefined;
    }, {
        schema: string;
        name: string;
        id?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: number;
    name: string;
    owner: string;
    publish_insert: boolean;
    publish_update: boolean;
    publish_delete: boolean;
    publish_truncate: boolean;
    tables: {
        schema: string;
        name: string;
        id?: number | undefined;
    }[] | null;
}, {
    id: number;
    name: string;
    owner: string;
    publish_insert: boolean;
    publish_update: boolean;
    publish_delete: boolean;
    publish_truncate: boolean;
    tables: {
        schema: string;
        name: string;
        id?: number | undefined;
    }[] | null;
}>>;
export type PGPublication = z.infer<typeof pgPublicationZod>;
declare function list({ limit, offset, }?: {
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgPublicationArrayZod;
};
type PublicationIdentifier = Pick<PGPublication, 'id'> | Pick<PGPublication, 'name'>;
declare function retrieve(identifier: PublicationIdentifier): {
    sql: string;
    zod: typeof pgPublicationOptionalZod;
};
type PublicationCreateParams = {
    name: string;
    publish_insert?: boolean;
    publish_update?: boolean;
    publish_delete?: boolean;
    publish_truncate?: boolean;
    tables?: string[] | null;
};
declare function create({ name, publish_insert, publish_update, publish_delete, publish_truncate, tables, }: PublicationCreateParams): {
    sql: string;
};
type PublicationUpdateParams = {
    name?: string;
    owner?: string;
    publish_insert?: boolean;
    publish_update?: boolean;
    publish_delete?: boolean;
    publish_truncate?: boolean;
    tables?: string[] | null;
};
declare function update(id: number, { name, owner, publish_insert, publish_update, publish_delete, publish_truncate, tables, }: PublicationUpdateParams): {
    sql: string;
};
declare function remove(publication: Pick<PGPublication, 'name'>): {
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
        publish_insert: z.ZodBoolean;
        publish_update: z.ZodBoolean;
        publish_delete: z.ZodBoolean;
        publish_truncate: z.ZodBoolean;
        tables: z.ZodNullable<z.ZodArray<z.ZodObject<{
            id: z.ZodOptional<z.ZodNumber>;
            name: z.ZodString;
            schema: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            schema: string;
            name: string;
            id?: number | undefined;
        }, {
            schema: string;
            name: string;
            id?: number | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        name: string;
        owner: string;
        publish_insert: boolean;
        publish_update: boolean;
        publish_delete: boolean;
        publish_truncate: boolean;
        tables: {
            schema: string;
            name: string;
            id?: number | undefined;
        }[] | null;
    }, {
        id: number;
        name: string;
        owner: string;
        publish_insert: boolean;
        publish_update: boolean;
        publish_delete: boolean;
        publish_truncate: boolean;
        tables: {
            schema: string;
            name: string;
            id?: number | undefined;
        }[] | null;
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-publications.d.ts.map