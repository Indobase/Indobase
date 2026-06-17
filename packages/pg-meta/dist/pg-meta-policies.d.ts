import { z } from 'zod';
declare const pgPolicyZod: z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    table: z.ZodString;
    table_id: z.ZodNumber;
    name: z.ZodString;
    action: z.ZodUnion<[z.ZodLiteral<"PERMISSIVE">, z.ZodLiteral<"RESTRICTIVE">]>;
    roles: z.ZodArray<z.ZodString, "many">;
    command: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"ALL">]>;
    definition: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    check: z.ZodUnion<[z.ZodString, z.ZodNull]>;
}, "strip", z.ZodTypeAny, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    check: string | null;
    definition: string | null;
    action: "PERMISSIVE" | "RESTRICTIVE";
    roles: string[];
    command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
}, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    check: string | null;
    definition: string | null;
    action: "PERMISSIVE" | "RESTRICTIVE";
    roles: string[];
    command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
}>;
declare const pgPolicyArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    table: z.ZodString;
    table_id: z.ZodNumber;
    name: z.ZodString;
    action: z.ZodUnion<[z.ZodLiteral<"PERMISSIVE">, z.ZodLiteral<"RESTRICTIVE">]>;
    roles: z.ZodArray<z.ZodString, "many">;
    command: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"ALL">]>;
    definition: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    check: z.ZodUnion<[z.ZodString, z.ZodNull]>;
}, "strip", z.ZodTypeAny, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    check: string | null;
    definition: string | null;
    action: "PERMISSIVE" | "RESTRICTIVE";
    roles: string[];
    command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
}, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    check: string | null;
    definition: string | null;
    action: "PERMISSIVE" | "RESTRICTIVE";
    roles: string[];
    command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
}>, "many">;
declare const pgPolicyOptionalZod: z.ZodOptional<z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    table: z.ZodString;
    table_id: z.ZodNumber;
    name: z.ZodString;
    action: z.ZodUnion<[z.ZodLiteral<"PERMISSIVE">, z.ZodLiteral<"RESTRICTIVE">]>;
    roles: z.ZodArray<z.ZodString, "many">;
    command: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"ALL">]>;
    definition: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    check: z.ZodUnion<[z.ZodString, z.ZodNull]>;
}, "strip", z.ZodTypeAny, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    check: string | null;
    definition: string | null;
    action: "PERMISSIVE" | "RESTRICTIVE";
    roles: string[];
    command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
}, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    check: string | null;
    definition: string | null;
    action: "PERMISSIVE" | "RESTRICTIVE";
    roles: string[];
    command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
}>>;
export type PGPolicy = z.infer<typeof pgPolicyZod>;
type PolicyIdentifier = Pick<PGPolicy, 'id'> | Pick<PGPolicy, 'name' | 'schema' | 'table'>;
declare function list({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgPolicyArrayZod;
};
declare function retrieve(identifier: PolicyIdentifier): {
    sql: string;
    zod: typeof pgPolicyOptionalZod;
};
type PolicyCreateParams = {
    name: string;
    schema?: string;
    table: string;
    definition?: string;
    check?: string;
    action?: 'PERMISSIVE' | 'RESTRICTIVE';
    command?: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    roles?: string[];
};
declare function create({ name, schema, table, definition, check, action, command, roles, }: PolicyCreateParams): {
    sql: string;
};
type PolicyUpdateParams = {
    name?: string;
    definition?: string;
    check?: string;
    roles?: string[];
};
declare function update(identifier: Pick<PGPolicy, 'name' | 'schema' | 'table'>, params: PolicyUpdateParams): {
    sql: string;
};
declare function remove(identifier: Pick<PGPolicy, 'name' | 'schema' | 'table'>): {
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
        schema: z.ZodString;
        table: z.ZodString;
        table_id: z.ZodNumber;
        name: z.ZodString;
        action: z.ZodUnion<[z.ZodLiteral<"PERMISSIVE">, z.ZodLiteral<"RESTRICTIVE">]>;
        roles: z.ZodArray<z.ZodString, "many">;
        command: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"ALL">]>;
        definition: z.ZodUnion<[z.ZodString, z.ZodNull]>;
        check: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    }, "strip", z.ZodTypeAny, {
        id: number;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        check: string | null;
        definition: string | null;
        action: "PERMISSIVE" | "RESTRICTIVE";
        roles: string[];
        command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
    }, {
        id: number;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        check: string | null;
        definition: string | null;
        action: "PERMISSIVE" | "RESTRICTIVE";
        roles: string[];
        command: "ALL" | "DELETE" | "INSERT" | "SELECT" | "UPDATE";
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-policies.d.ts.map