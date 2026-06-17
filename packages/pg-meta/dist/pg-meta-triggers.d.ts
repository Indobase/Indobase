import { z } from 'zod';
type TriggerIdentifier = Pick<PGTrigger, 'id'> | Pick<PGTrigger, 'name' | 'schema' | 'table'>;
export declare const pgTriggerZod: z.ZodObject<{
    id: z.ZodNumber;
    table_id: z.ZodNumber;
    enabled_mode: z.ZodEnum<["DISABLED", "ORIGIN", "REPLICA", "ALWAYS"]>;
    function_args: z.ZodArray<z.ZodString, "many">;
    name: z.ZodString;
    table: z.ZodString;
    schema: z.ZodString;
    condition: z.ZodNullable<z.ZodString>;
    orientation: z.ZodString;
    activation: z.ZodString;
    events: z.ZodArray<z.ZodString, "many">;
    function_name: z.ZodString;
    function_schema: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
    function_args: string[];
    condition: string | null;
    orientation: string;
    activation: string;
    events: string[];
    function_name: string;
    function_schema: string;
}, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
    function_args: string[];
    condition: string | null;
    orientation: string;
    activation: string;
    events: string[];
    function_name: string;
    function_schema: string;
}>;
export type PGTrigger = z.infer<typeof pgTriggerZod>;
export declare const pgTriggerArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    table_id: z.ZodNumber;
    enabled_mode: z.ZodEnum<["DISABLED", "ORIGIN", "REPLICA", "ALWAYS"]>;
    function_args: z.ZodArray<z.ZodString, "many">;
    name: z.ZodString;
    table: z.ZodString;
    schema: z.ZodString;
    condition: z.ZodNullable<z.ZodString>;
    orientation: z.ZodString;
    activation: z.ZodString;
    events: z.ZodArray<z.ZodString, "many">;
    function_name: z.ZodString;
    function_schema: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
    function_args: string[];
    condition: string | null;
    orientation: string;
    activation: string;
    events: string[];
    function_name: string;
    function_schema: string;
}, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
    function_args: string[];
    condition: string | null;
    orientation: string;
    activation: string;
    events: string[];
    function_name: string;
    function_schema: string;
}>, "many">;
export declare const pgTriggerOptionalZod: z.ZodOptional<z.ZodObject<{
    id: z.ZodNumber;
    table_id: z.ZodNumber;
    enabled_mode: z.ZodEnum<["DISABLED", "ORIGIN", "REPLICA", "ALWAYS"]>;
    function_args: z.ZodArray<z.ZodString, "many">;
    name: z.ZodString;
    table: z.ZodString;
    schema: z.ZodString;
    condition: z.ZodNullable<z.ZodString>;
    orientation: z.ZodString;
    activation: z.ZodString;
    events: z.ZodArray<z.ZodString, "many">;
    function_name: z.ZodString;
    function_schema: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
    function_args: string[];
    condition: string | null;
    orientation: string;
    activation: string;
    events: string[];
    function_name: string;
    function_schema: string;
}, {
    id: number;
    table_id: number;
    schema: string;
    table: string;
    name: string;
    enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
    function_args: string[];
    condition: string | null;
    orientation: string;
    activation: string;
    events: string[];
    function_name: string;
    function_schema: string;
}>>;
export declare function list({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgTriggerArrayZod;
};
type TriggersRetrieveReturn = {
    sql: string;
    zod: typeof pgTriggerOptionalZod;
};
export declare function retrieve(identifier: TriggerIdentifier): TriggersRetrieveReturn;
export declare const pgTriggerCreateZod: z.ZodObject<{
    name: z.ZodString;
    schema: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    table: z.ZodString;
    function_schema: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    function_name: z.ZodString;
    function_args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    activation: z.ZodEnum<["BEFORE", "AFTER", "INSTEAD OF"]>;
    events: z.ZodArray<z.ZodString, "many">;
    orientation: z.ZodOptional<z.ZodEnum<["ROW", "STATEMENT"]>>;
    condition: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    schema: string;
    table: string;
    name: string;
    activation: "BEFORE" | "AFTER" | "INSTEAD OF";
    events: string[];
    function_name: string;
    function_schema: string;
    function_args?: string[] | undefined;
    condition?: string | undefined;
    orientation?: "ROW" | "STATEMENT" | undefined;
}, {
    table: string;
    name: string;
    activation: "BEFORE" | "AFTER" | "INSTEAD OF";
    events: string[];
    function_name: string;
    schema?: string | undefined;
    function_args?: string[] | undefined;
    condition?: string | undefined;
    orientation?: "ROW" | "STATEMENT" | undefined;
    function_schema?: string | undefined;
}>;
export type PGTriggerCreate = z.infer<typeof pgTriggerCreateZod>;
export declare function create({ name, schema, table, function_schema, function_name, function_args, activation, events, orientation, condition, }: PGTriggerCreate): {
    sql: string;
    zod: z.ZodType<void>;
};
export declare const pgTriggerUpdateZod: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    enabled_mode: z.ZodOptional<z.ZodEnum<["ORIGIN", "REPLICA", "ALWAYS", "DISABLED"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    enabled_mode?: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA" | undefined;
}, {
    name?: string | undefined;
    enabled_mode?: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA" | undefined;
}>;
export type PGTriggerUpdate = z.infer<typeof pgTriggerUpdateZod>;
export declare function update(id: {
    name: string;
    schema: string;
    table: string;
}, params: PGTriggerUpdate): {
    sql: string;
    zod: z.ZodType<void>;
};
export declare function remove(id: {
    name: string;
    schema: string;
    table: string;
}, { cascade }?: {
    cascade?: boolean | undefined;
}): {
    sql: string;
    zod: z.ZodType<void>;
};
declare const _default: {
    list: typeof list;
    retrieve: typeof retrieve;
    create: typeof create;
    update: typeof update;
    remove: typeof remove;
    zod: z.ZodObject<{
        id: z.ZodNumber;
        table_id: z.ZodNumber;
        enabled_mode: z.ZodEnum<["DISABLED", "ORIGIN", "REPLICA", "ALWAYS"]>;
        function_args: z.ZodArray<z.ZodString, "many">;
        name: z.ZodString;
        table: z.ZodString;
        schema: z.ZodString;
        condition: z.ZodNullable<z.ZodString>;
        orientation: z.ZodString;
        activation: z.ZodString;
        events: z.ZodArray<z.ZodString, "many">;
        function_name: z.ZodString;
        function_schema: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: number;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
        function_args: string[];
        condition: string | null;
        orientation: string;
        activation: string;
        events: string[];
        function_name: string;
        function_schema: string;
    }, {
        id: number;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        enabled_mode: "ALWAYS" | "DISABLED" | "ORIGIN" | "REPLICA";
        function_args: string[];
        condition: string | null;
        orientation: string;
        activation: string;
        events: string[];
        function_name: string;
        function_schema: string;
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-triggers.d.ts.map