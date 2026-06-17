import { Static } from '@sinclair/typebox';
import { Options as PrettierOptions } from 'prettier';
export interface FormatterOptions extends PrettierOptions {
}
export interface PostgresMetaOk<T> {
    data: T;
    error: null;
}
export interface PostgresMetaErr {
    data: null;
    error: {
        message: string;
    };
}
export type PostgresMetaResult<T> = PostgresMetaOk<T> | PostgresMetaErr;
export declare const postgresColumnSchema: import("@sinclair/typebox").TObject<{
    table_id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    table: import("@sinclair/typebox").TString<string>;
    id: import("@sinclair/typebox").TString<string>;
    ordinal_position: import("@sinclair/typebox").TInteger;
    name: import("@sinclair/typebox").TString<string>;
    default_value: import("@sinclair/typebox").TUnknown;
    data_type: import("@sinclair/typebox").TString<string>;
    format: import("@sinclair/typebox").TString<string>;
    is_identity: import("@sinclair/typebox").TBoolean;
    identity_generation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ALWAYS">, import("@sinclair/typebox").TLiteral<"BY DEFAULT">, import("@sinclair/typebox").TNull]>;
    is_generated: import("@sinclair/typebox").TBoolean;
    is_nullable: import("@sinclair/typebox").TBoolean;
    is_updatable: import("@sinclair/typebox").TBoolean;
    is_unique: import("@sinclair/typebox").TBoolean;
    enums: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
    check: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
}>;
export type PostgresColumn = Static<typeof postgresColumnSchema>;
export declare const postgresConfigSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TUnknown;
    setting: import("@sinclair/typebox").TUnknown;
    category: import("@sinclair/typebox").TUnknown;
    group: import("@sinclair/typebox").TUnknown;
    subgroup: import("@sinclair/typebox").TUnknown;
    unit: import("@sinclair/typebox").TUnknown;
    short_desc: import("@sinclair/typebox").TUnknown;
    extra_desc: import("@sinclair/typebox").TUnknown;
    context: import("@sinclair/typebox").TUnknown;
    vartype: import("@sinclair/typebox").TUnknown;
    source: import("@sinclair/typebox").TUnknown;
    min_val: import("@sinclair/typebox").TUnknown;
    max_val: import("@sinclair/typebox").TUnknown;
    enumvals: import("@sinclair/typebox").TUnknown;
    boot_val: import("@sinclair/typebox").TUnknown;
    reset_val: import("@sinclair/typebox").TUnknown;
    sourcefile: import("@sinclair/typebox").TUnknown;
    sourceline: import("@sinclair/typebox").TUnknown;
    pending_restart: import("@sinclair/typebox").TUnknown;
}>;
export type PostgresConfig = Static<typeof postgresConfigSchema>;
export declare const postgresExtensionSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString<string>;
    schema: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    default_version: import("@sinclair/typebox").TString<string>;
    installed_version: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
}>;
export type PostgresExtension = Static<typeof postgresExtensionSchema>;
export declare const postgresForeignTableSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    name: import("@sinclair/typebox").TString<string>;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    columns: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        table_id: import("@sinclair/typebox").TInteger;
        schema: import("@sinclair/typebox").TString<string>;
        table: import("@sinclair/typebox").TString<string>;
        id: import("@sinclair/typebox").TString<string>;
        ordinal_position: import("@sinclair/typebox").TInteger;
        name: import("@sinclair/typebox").TString<string>;
        default_value: import("@sinclair/typebox").TUnknown;
        data_type: import("@sinclair/typebox").TString<string>;
        format: import("@sinclair/typebox").TString<string>;
        is_identity: import("@sinclair/typebox").TBoolean;
        identity_generation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ALWAYS">, import("@sinclair/typebox").TLiteral<"BY DEFAULT">, import("@sinclair/typebox").TNull]>;
        is_generated: import("@sinclair/typebox").TBoolean;
        is_nullable: import("@sinclair/typebox").TBoolean;
        is_updatable: import("@sinclair/typebox").TBoolean;
        is_unique: import("@sinclair/typebox").TBoolean;
        enums: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
        check: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
        comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    }>>>;
}>;
export type PostgresForeignTable = Static<typeof postgresForeignTableSchema>;
declare const postgresFunctionSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    name: import("@sinclair/typebox").TString<string>;
    language: import("@sinclair/typebox").TString<string>;
    definition: import("@sinclair/typebox").TString<string>;
    complete_statement: import("@sinclair/typebox").TString<string>;
    args: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        mode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"in">, import("@sinclair/typebox").TLiteral<"out">, import("@sinclair/typebox").TLiteral<"inout">, import("@sinclair/typebox").TLiteral<"variadic">, import("@sinclair/typebox").TLiteral<"table">]>;
        name: import("@sinclair/typebox").TString<string>;
        type_id: import("@sinclair/typebox").TNumber;
        has_default: import("@sinclair/typebox").TBoolean;
    }>>;
    argument_types: import("@sinclair/typebox").TString<string>;
    identity_argument_types: import("@sinclair/typebox").TString<string>;
    return_type_id: import("@sinclair/typebox").TInteger;
    return_type: import("@sinclair/typebox").TString<string>;
    return_type_relation_id: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TInteger, import("@sinclair/typebox").TNull]>;
    is_set_returning_function: import("@sinclair/typebox").TBoolean;
    behavior: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"IMMUTABLE">, import("@sinclair/typebox").TLiteral<"STABLE">, import("@sinclair/typebox").TLiteral<"VOLATILE">]>;
    security_definer: import("@sinclair/typebox").TBoolean;
    config_params: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TString<string>>, import("@sinclair/typebox").TNull]>;
}>;
export type PostgresFunction = Static<typeof postgresFunctionSchema>;
export declare const postgresFunctionCreateFunction: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString<string>;
    definition: import("@sinclair/typebox").TString<string>;
    args: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>>;
    behavior: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"IMMUTABLE">, import("@sinclair/typebox").TLiteral<"STABLE">, import("@sinclair/typebox").TLiteral<"VOLATILE">]>>;
    config_params: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TString<string>>>;
    schema: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    language: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    return_type: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    security_definer: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
}>;
export type PostgresFunctionCreate = Static<typeof postgresFunctionCreateFunction>;
export declare const postgresPolicySchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    table: import("@sinclair/typebox").TString<string>;
    table_id: import("@sinclair/typebox").TInteger;
    name: import("@sinclair/typebox").TString<string>;
    action: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"PERMISSIVE">, import("@sinclair/typebox").TLiteral<"RESTRICTIVE">]>;
    roles: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
    command: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"SELECT">, import("@sinclair/typebox").TLiteral<"INSERT">, import("@sinclair/typebox").TLiteral<"UPDATE">, import("@sinclair/typebox").TLiteral<"DELETE">, import("@sinclair/typebox").TLiteral<"ALL">]>;
    definition: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    check: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
}>;
export type PostgresPolicy = Static<typeof postgresPolicySchema>;
export declare const postgresPrimaryKeySchema: import("@sinclair/typebox").TObject<{
    schema: import("@sinclair/typebox").TString<string>;
    table_name: import("@sinclair/typebox").TString<string>;
    name: import("@sinclair/typebox").TString<string>;
    table_id: import("@sinclair/typebox").TInteger;
}>;
export type PostgresPrimaryKey = Static<typeof postgresPrimaryKeySchema>;
export declare const postgresPublicationSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    name: import("@sinclair/typebox").TString<string>;
    owner: import("@sinclair/typebox").TString<string>;
    publish_insert: import("@sinclair/typebox").TBoolean;
    publish_update: import("@sinclair/typebox").TBoolean;
    publish_delete: import("@sinclair/typebox").TBoolean;
    publish_truncate: import("@sinclair/typebox").TBoolean;
    tables: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TInteger;
        name: import("@sinclair/typebox").TString<string>;
        schema: import("@sinclair/typebox").TString<string>;
    }>>, import("@sinclair/typebox").TNull]>;
}>;
export type PostgresPublication = Static<typeof postgresPublicationSchema>;
export declare const postgresRelationshipSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    constraint_name: import("@sinclair/typebox").TString<string>;
    source_schema: import("@sinclair/typebox").TString<string>;
    source_table_name: import("@sinclair/typebox").TString<string>;
    source_column_name: import("@sinclair/typebox").TString<string>;
    target_table_schema: import("@sinclair/typebox").TString<string>;
    target_table_name: import("@sinclair/typebox").TString<string>;
    target_column_name: import("@sinclair/typebox").TString<string>;
}>;
export type PostgresRelationship = Static<typeof postgresRelationshipSchema>;
export declare const PostgresMetaRoleConfigSchema: import("@sinclair/typebox").TObject<{
    op: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"remove">, import("@sinclair/typebox").TLiteral<"add">, import("@sinclair/typebox").TLiteral<"replace">]>;
    path: import("@sinclair/typebox").TString<string>;
    value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
}>;
export type PostgresMetaRoleConfig = Static<typeof PostgresMetaRoleConfigSchema>;
export declare const postgresRoleSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    name: import("@sinclair/typebox").TString<string>;
    is_superuser: import("@sinclair/typebox").TBoolean;
    can_create_db: import("@sinclair/typebox").TBoolean;
    can_create_role: import("@sinclair/typebox").TBoolean;
    inherit_role: import("@sinclair/typebox").TBoolean;
    can_login: import("@sinclair/typebox").TBoolean;
    is_replication_role: import("@sinclair/typebox").TBoolean;
    can_bypass_rls: import("@sinclair/typebox").TBoolean;
    active_connections: import("@sinclair/typebox").TInteger;
    connection_limit: import("@sinclair/typebox").TInteger;
    password: import("@sinclair/typebox").TString<string>;
    valid_until: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    config: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull, import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TString<string>>]>;
}>;
export type PostgresRole = Static<typeof postgresRoleSchema>;
export declare const postgresRoleCreateSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString<string>;
    password: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    inherit_role: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_login: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    is_superuser: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_create_db: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_create_role: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    is_replication_role: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_bypass_rls: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    connection_limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    member_of: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>>;
    members: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>>;
    admins: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>>;
    valid_until: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    config: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TString<string>>>;
}>;
export type PostgresRoleCreate = Static<typeof postgresRoleCreateSchema>;
export declare const postgresRoleUpdateSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    password: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    inherit_role: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_login: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    is_superuser: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_create_db: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_create_role: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    is_replication_role: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    can_bypass_rls: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    connection_limit: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TInteger>;
    valid_until: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    config: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        op: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"remove">, import("@sinclair/typebox").TLiteral<"add">, import("@sinclair/typebox").TLiteral<"replace">]>;
        path: import("@sinclair/typebox").TString<string>;
        value: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    }>>>;
}>;
export type PostgresRoleUpdate = Static<typeof postgresRoleUpdateSchema>;
export declare const postgresSchemaSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    name: import("@sinclair/typebox").TString<string>;
    owner: import("@sinclair/typebox").TString<string>;
}>;
export type PostgresSchema = Static<typeof postgresSchemaSchema>;
export declare const postgresSchemaCreateSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString<string>;
    owner: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
}>;
export type PostgresSchemaCreate = Static<typeof postgresSchemaCreateSchema>;
export declare const postgresSchemaUpdateSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    owner: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
}>;
export type PostgresSchemaUpdate = Static<typeof postgresSchemaUpdateSchema>;
export declare const postgresTableSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    name: import("@sinclair/typebox").TString<string>;
    rls_enabled: import("@sinclair/typebox").TBoolean;
    rls_forced: import("@sinclair/typebox").TBoolean;
    replica_identity: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"DEFAULT">, import("@sinclair/typebox").TLiteral<"INDEX">, import("@sinclair/typebox").TLiteral<"FULL">, import("@sinclair/typebox").TLiteral<"NOTHING">]>;
    bytes: import("@sinclair/typebox").TInteger;
    size: import("@sinclair/typebox").TString<string>;
    live_rows_estimate: import("@sinclair/typebox").TInteger;
    dead_rows_estimate: import("@sinclair/typebox").TInteger;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    columns: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        table_id: import("@sinclair/typebox").TInteger;
        schema: import("@sinclair/typebox").TString<string>;
        table: import("@sinclair/typebox").TString<string>;
        id: import("@sinclair/typebox").TString<string>;
        ordinal_position: import("@sinclair/typebox").TInteger;
        name: import("@sinclair/typebox").TString<string>;
        default_value: import("@sinclair/typebox").TUnknown;
        data_type: import("@sinclair/typebox").TString<string>;
        format: import("@sinclair/typebox").TString<string>;
        is_identity: import("@sinclair/typebox").TBoolean;
        identity_generation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ALWAYS">, import("@sinclair/typebox").TLiteral<"BY DEFAULT">, import("@sinclair/typebox").TNull]>;
        is_generated: import("@sinclair/typebox").TBoolean;
        is_nullable: import("@sinclair/typebox").TBoolean;
        is_updatable: import("@sinclair/typebox").TBoolean;
        is_unique: import("@sinclair/typebox").TBoolean;
        enums: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
        check: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
        comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    }>>>;
    primary_keys: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        schema: import("@sinclair/typebox").TString<string>;
        table_name: import("@sinclair/typebox").TString<string>;
        name: import("@sinclair/typebox").TString<string>;
        table_id: import("@sinclair/typebox").TInteger;
    }>>;
    relationships: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        id: import("@sinclair/typebox").TInteger;
        constraint_name: import("@sinclair/typebox").TString<string>;
        source_schema: import("@sinclair/typebox").TString<string>;
        source_table_name: import("@sinclair/typebox").TString<string>;
        source_column_name: import("@sinclair/typebox").TString<string>;
        target_table_schema: import("@sinclair/typebox").TString<string>;
        target_table_name: import("@sinclair/typebox").TString<string>;
        target_column_name: import("@sinclair/typebox").TString<string>;
    }>>;
}>;
export type PostgresTable = Static<typeof postgresTableSchema>;
export declare const postgresTableCreateSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString<string>;
    schema: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    comment: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
}>;
export type PostgresTableCreate = Static<typeof postgresTableCreateSchema>;
export declare const postgresTableUpdateSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    schema: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    rls_enabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    rls_forced: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    replica_identity: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"DEFAULT">, import("@sinclair/typebox").TLiteral<"INDEX">, import("@sinclair/typebox").TLiteral<"FULL">, import("@sinclair/typebox").TLiteral<"NOTHING">]>>;
    replica_identity_index: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
    primary_keys: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        name: import("@sinclair/typebox").TString<string>;
    }>>>;
    comment: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString<string>>;
}>;
export type PostgresTableUpdate = Static<typeof postgresTableUpdateSchema>;
export declare const postgresTriggerSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    table_id: import("@sinclair/typebox").TInteger;
    enabled_mode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ORIGIN">, import("@sinclair/typebox").TLiteral<"REPLICA">, import("@sinclair/typebox").TLiteral<"ALWAYS">, import("@sinclair/typebox").TLiteral<"DISABLED">]>;
    name: import("@sinclair/typebox").TString<string>;
    table: import("@sinclair/typebox").TString<string>;
    schema: import("@sinclair/typebox").TString<string>;
    condition: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    orientation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ROW">, import("@sinclair/typebox").TLiteral<"STATEMENT">]>;
    activation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"BEFORE">, import("@sinclair/typebox").TLiteral<"AFTER">, import("@sinclair/typebox").TLiteral<"INSTEAD OF">]>;
    events: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
    function_schema: import("@sinclair/typebox").TString<string>;
    function_name: import("@sinclair/typebox").TString<string>;
    function_args: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
}>;
export type PostgresTrigger = Static<typeof postgresTriggerSchema>;
export declare const postgresTypeSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    name: import("@sinclair/typebox").TString<string>;
    schema: import("@sinclair/typebox").TString<string>;
    format: import("@sinclair/typebox").TString<string>;
    enums: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
    attributes: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        name: import("@sinclair/typebox").TString<string>;
        type_id: import("@sinclair/typebox").TInteger;
    }>>;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
}>;
export type PostgresType = Static<typeof postgresTypeSchema>;
export declare const postgresVersionSchema: import("@sinclair/typebox").TObject<{
    version: import("@sinclair/typebox").TString<string>;
    version_number: import("@sinclair/typebox").TInteger;
    active_connections: import("@sinclair/typebox").TInteger;
    max_connections: import("@sinclair/typebox").TInteger;
}>;
export type PostgresVersion = Static<typeof postgresVersionSchema>;
export declare const postgresViewSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    name: import("@sinclair/typebox").TString<string>;
    is_updatable: import("@sinclair/typebox").TBoolean;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    columns: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        table_id: import("@sinclair/typebox").TInteger;
        schema: import("@sinclair/typebox").TString<string>;
        table: import("@sinclair/typebox").TString<string>;
        id: import("@sinclair/typebox").TString<string>;
        ordinal_position: import("@sinclair/typebox").TInteger;
        name: import("@sinclair/typebox").TString<string>;
        default_value: import("@sinclair/typebox").TUnknown;
        data_type: import("@sinclair/typebox").TString<string>;
        format: import("@sinclair/typebox").TString<string>;
        is_identity: import("@sinclair/typebox").TBoolean;
        identity_generation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ALWAYS">, import("@sinclair/typebox").TLiteral<"BY DEFAULT">, import("@sinclair/typebox").TNull]>;
        is_generated: import("@sinclair/typebox").TBoolean;
        is_nullable: import("@sinclair/typebox").TBoolean;
        is_updatable: import("@sinclair/typebox").TBoolean;
        is_unique: import("@sinclair/typebox").TBoolean;
        enums: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
        check: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
        comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    }>>>;
}>;
export type PostgresView = Static<typeof postgresViewSchema>;
export declare const postgresMaterializedViewSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TInteger;
    schema: import("@sinclair/typebox").TString<string>;
    name: import("@sinclair/typebox").TString<string>;
    is_populated: import("@sinclair/typebox").TBoolean;
    comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    columns: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
        table_id: import("@sinclair/typebox").TInteger;
        schema: import("@sinclair/typebox").TString<string>;
        table: import("@sinclair/typebox").TString<string>;
        id: import("@sinclair/typebox").TString<string>;
        ordinal_position: import("@sinclair/typebox").TInteger;
        name: import("@sinclair/typebox").TString<string>;
        default_value: import("@sinclair/typebox").TUnknown;
        data_type: import("@sinclair/typebox").TString<string>;
        format: import("@sinclair/typebox").TString<string>;
        is_identity: import("@sinclair/typebox").TBoolean;
        identity_generation: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"ALWAYS">, import("@sinclair/typebox").TLiteral<"BY DEFAULT">, import("@sinclair/typebox").TNull]>;
        is_generated: import("@sinclair/typebox").TBoolean;
        is_nullable: import("@sinclair/typebox").TBoolean;
        is_updatable: import("@sinclair/typebox").TBoolean;
        is_unique: import("@sinclair/typebox").TBoolean;
        enums: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString<string>>;
        check: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
        comment: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString<string>, import("@sinclair/typebox").TNull]>;
    }>>>;
}>;
export type PostgresMaterializedView = Static<typeof postgresMaterializedViewSchema>;
export {};
//# sourceMappingURL=types.d.ts.map