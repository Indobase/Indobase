import { z } from 'zod';
declare const pgTypeArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    schema: z.ZodString;
    format: z.ZodString;
    enums: z.ZodArray<z.ZodString, "many">;
    attributes: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type_id: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type_id: number;
    }, {
        name: string;
        type_id: number;
    }>, "many">;
    comment: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: number;
    schema: string;
    name: string;
    format: string;
    enums: string[];
    comment: string | null;
    attributes: {
        name: string;
        type_id: number;
    }[];
}, {
    id: number;
    schema: string;
    name: string;
    format: string;
    enums: string[];
    comment: string | null;
    attributes: {
        name: string;
        type_id: number;
    }[];
}>, "many">;
declare function list({ includeArrayTypes, includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
    includeArrayTypes?: boolean;
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgTypeArrayZod;
};
declare const _default: {
    list: typeof list;
    zod: z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodString;
        schema: z.ZodString;
        format: z.ZodString;
        enums: z.ZodArray<z.ZodString, "many">;
        attributes: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type_id: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            name: string;
            type_id: number;
        }, {
            name: string;
            type_id: number;
        }>, "many">;
        comment: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        schema: string;
        name: string;
        format: string;
        enums: string[];
        comment: string | null;
        attributes: {
            name: string;
            type_id: number;
        }[];
    }, {
        id: number;
        schema: string;
        name: string;
        format: string;
        enums: string[];
        comment: string | null;
        attributes: {
            name: string;
            type_id: number;
        }[];
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-types.d.ts.map