import { z } from 'zod';
declare const pgTableZod: z.ZodObject<{
    id: z.ZodNumber;
    schema: z.ZodString;
    name: z.ZodString;
    rls_enabled: z.ZodBoolean;
    rls_forced: z.ZodBoolean;
    replica_identity: z.ZodEnum<["DEFAULT", "INDEX", "FULL", "NOTHING"]>;
    bytes: z.ZodNumber;
    size: z.ZodString;
    live_rows_estimate: z.ZodNumber;
    dead_rows_estimate: z.ZodNumber;
    comment: z.ZodNullable<z.ZodString>;
    primary_keys: z.ZodArray<z.ZodObject<{
        table_id: z.ZodNumber;
        name: z.ZodString;
        schema: z.ZodString;
        table_name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        table_id: number;
        schema: string;
        name: string;
        table_name: string;
    }, {
        table_id: number;
        schema: string;
        name: string;
        table_name: string;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        id: z.ZodNumber;
        constraint_name: z.ZodString;
        source_schema: z.ZodString;
        source_table_name: z.ZodString;
        source_column_name: z.ZodString;
        target_table_schema: z.ZodString;
        target_table_name: z.ZodString;
        target_column_name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: number;
        constraint_name: string;
        source_schema: string;
        source_table_name: string;
        source_column_name: string;
        target_table_schema: string;
        target_table_name: string;
        target_column_name: string;
    }, {
        id: number;
        constraint_name: string;
        source_schema: string;
        source_table_name: string;
        source_column_name: string;
        target_table_schema: string;
        target_table_name: string;
        target_column_name: string;
    }>, "many">;
    columns: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        table_id: z.ZodNumber;
        schema: z.ZodString;
        table: z.ZodString;
        name: z.ZodString;
        ordinal_position: z.ZodNumber;
        data_type: z.ZodString;
        format: z.ZodString;
        is_identity: z.ZodBoolean;
        identity_generation: z.ZodNullable<z.ZodString>;
        is_generated: z.ZodBoolean;
        is_nullable: z.ZodBoolean;
        is_updatable: z.ZodBoolean;
        is_unique: z.ZodBoolean;
        check: z.ZodNullable<z.ZodString>;
        default_value: z.ZodNullable<z.ZodAny>;
        enums: z.ZodArray<z.ZodString, "many">;
        comment: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        ordinal_position: number;
        data_type: string;
        format: string;
        is_identity: boolean;
        identity_generation: string | null;
        is_generated: boolean;
        is_nullable: boolean;
        is_updatable: boolean;
        is_unique: boolean;
        check: string | null;
        enums: string[];
        comment: string | null;
        default_value?: any;
    }, {
        id: string;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        ordinal_position: number;
        data_type: string;
        format: string;
        is_identity: boolean;
        identity_generation: string | null;
        is_generated: boolean;
        is_nullable: boolean;
        is_updatable: boolean;
        is_unique: boolean;
        check: string | null;
        enums: string[];
        comment: string | null;
        default_value?: any;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    id: number;
    schema: string;
    name: string;
    comment: string | null;
    rls_enabled: boolean;
    rls_forced: boolean;
    replica_identity: "DEFAULT" | "FULL" | "INDEX" | "NOTHING";
    bytes: number;
    size: string;
    live_rows_estimate: number;
    dead_rows_estimate: number;
    primary_keys: {
        table_id: number;
        schema: string;
        name: string;
        table_name: string;
    }[];
    relationships: {
        id: number;
        constraint_name: string;
        source_schema: string;
        source_table_name: string;
        source_column_name: string;
        target_table_schema: string;
        target_table_name: string;
        target_column_name: string;
    }[];
    columns?: {
        id: string;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        ordinal_position: number;
        data_type: string;
        format: string;
        is_identity: boolean;
        identity_generation: string | null;
        is_generated: boolean;
        is_nullable: boolean;
        is_updatable: boolean;
        is_unique: boolean;
        check: string | null;
        enums: string[];
        comment: string | null;
        default_value?: any;
    }[] | undefined;
}, {
    id: number;
    schema: string;
    name: string;
    comment: string | null;
    rls_enabled: boolean;
    rls_forced: boolean;
    replica_identity: "DEFAULT" | "FULL" | "INDEX" | "NOTHING";
    bytes: number;
    size: string;
    live_rows_estimate: number;
    dead_rows_estimate: number;
    primary_keys: {
        table_id: number;
        schema: string;
        name: string;
        table_name: string;
    }[];
    relationships: {
        id: number;
        constraint_name: string;
        source_schema: string;
        source_table_name: string;
        source_column_name: string;
        target_table_schema: string;
        target_table_name: string;
        target_column_name: string;
    }[];
    columns?: {
        id: string;
        table_id: number;
        schema: string;
        table: string;
        name: string;
        ordinal_position: number;
        data_type: string;
        format: string;
        is_identity: boolean;
        identity_generation: string | null;
        is_generated: boolean;
        is_nullable: boolean;
        is_updatable: boolean;
        is_unique: boolean;
        check: string | null;
        enums: string[];
        comment: string | null;
        default_value?: any;
    }[] | undefined;
}>;
export type PGTable = z.infer<typeof pgTableZod>;
type TableWithoutColumns = Omit<PGTable, 'columns'>;
type TableWithColumns = PGTable;
type TableBasedOnIncludeColumns<T extends boolean | undefined> = T extends true ? TableWithColumns : TableWithoutColumns;
type TableIdentifier = Pick<PGTable, 'id'> | Pick<PGTable, 'name' | 'schema'>;
declare function list<T extends boolean | undefined = true>({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, includeColumns, }?: {
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    limit?: number;
    offset?: number;
    includeColumns?: T;
}): {
    sql: string;
    zod: z.ZodType<TableBasedOnIncludeColumns<T>[]>;
};
declare function retrieve(identifier: TableIdentifier): {
    sql: string;
    zod: z.ZodType<TableWithColumns>;
};
declare function remove(table: Pick<PGTable, 'name' | 'schema'>, { cascade }?: {
    cascade?: boolean | undefined;
}): {
    sql: string;
};
type TableCreateParams = {
    name: string;
    schema?: string;
    comment?: string | null;
};
declare function create({ name, schema, comment }: TableCreateParams): {
    sql: string;
};
type TableUpdateParams = {
    name?: string;
    schema?: string;
    rls_enabled?: boolean;
    rls_forced?: boolean;
    replica_identity?: 'DEFAULT' | 'INDEX' | 'FULL' | 'NOTHING';
    replica_identity_index?: string;
    primary_keys?: Array<{
        name: string;
    }>;
    comment?: string | null;
};
declare function update(old: Pick<PGTable, 'id' | 'name' | 'schema'>, { name, schema, rls_enabled, rls_forced, replica_identity, replica_identity_index, primary_keys, comment, }: TableUpdateParams): {
    sql: string;
};
export { create, list, remove, retrieve, update };
//# sourceMappingURL=pg-meta-tables.d.ts.map