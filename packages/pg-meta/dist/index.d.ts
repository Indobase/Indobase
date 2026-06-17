import * as functions from './pg-meta-functions';
import * as tables from './pg-meta-tables';
import * as query from './query/index';
declare const _default: {
    roles: {
        list: ({ includeDefaultRoles: includeDefaultRoles, limit, offset, }?: {
            includeDefaultRoles?: boolean;
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                isSuperuser: import("zod").ZodBoolean;
                canCreateDb: import("zod").ZodBoolean;
                canCreateRole: import("zod").ZodBoolean;
                inheritRole: import("zod").ZodBoolean;
                canLogin: import("zod").ZodBoolean;
                isReplicationRole: import("zod").ZodBoolean;
                canBypassRls: import("zod").ZodBoolean;
                activeConnections: import("zod").ZodNumber;
                connectionLimit: import("zod").ZodNumber;
                validUntil: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
                config: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
                id: number;
                name: string;
                isSuperuser: boolean;
                canCreateDb: boolean;
                canCreateRole: boolean;
                inheritRole: boolean;
                canLogin: boolean;
                isReplicationRole: boolean;
                canBypassRls: boolean;
                activeConnections: number;
                connectionLimit: number;
                validUntil: string | null;
                config: Record<string, string>;
            }, {
                id: number;
                name: string;
                isSuperuser: boolean;
                canCreateDb: boolean;
                canCreateRole: boolean;
                inheritRole: boolean;
                canLogin: boolean;
                isReplicationRole: boolean;
                canBypassRls: boolean;
                activeConnections: number;
                connectionLimit: number;
                validUntil: string | null;
                config: Record<string, string>;
            }>, "many">;
        };
        retrieve: (identifier: Pick<{
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, "id"> | Pick<{
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, "name">) => {
            sql: string;
            zod: import("zod").ZodOptional<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                isSuperuser: import("zod").ZodBoolean;
                canCreateDb: import("zod").ZodBoolean;
                canCreateRole: import("zod").ZodBoolean;
                inheritRole: import("zod").ZodBoolean;
                canLogin: import("zod").ZodBoolean;
                isReplicationRole: import("zod").ZodBoolean;
                canBypassRls: import("zod").ZodBoolean;
                activeConnections: import("zod").ZodNumber;
                connectionLimit: import("zod").ZodNumber;
                validUntil: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
                config: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
                id: number;
                name: string;
                isSuperuser: boolean;
                canCreateDb: boolean;
                canCreateRole: boolean;
                inheritRole: boolean;
                canLogin: boolean;
                isReplicationRole: boolean;
                canBypassRls: boolean;
                activeConnections: number;
                connectionLimit: number;
                validUntil: string | null;
                config: Record<string, string>;
            }, {
                id: number;
                name: string;
                isSuperuser: boolean;
                canCreateDb: boolean;
                canCreateRole: boolean;
                inheritRole: boolean;
                canLogin: boolean;
                isReplicationRole: boolean;
                canBypassRls: boolean;
                activeConnections: number;
                connectionLimit: number;
                validUntil: string | null;
                config: Record<string, string>;
            }>>;
        };
        create: ({ name, isSuperuser, canCreateDb, canCreateRole, inheritRole, canLogin, isReplicationRole, canBypassRls, connectionLimit, password, validUntil, memberOf, members, admins, config, }: {
            name: string;
            isSuperuser?: boolean;
            canCreateDb?: boolean;
            canCreateRole?: boolean;
            inheritRole?: boolean;
            canLogin?: boolean;
            isReplicationRole?: boolean;
            canBypassRls?: boolean;
            connectionLimit?: number;
            password?: string;
            validUntil?: string;
            memberOf?: string[];
            members?: string[];
            admins?: string[];
            config?: Record<string, string>;
        }) => {
            sql: string;
        };
        update: (identifier: Pick<{
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, "id"> | Pick<{
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, "name">, params: {
            name?: string;
            isSuperuser?: boolean;
            canCreateDb?: boolean;
            canCreateRole?: boolean;
            inheritRole?: boolean;
            canLogin?: boolean;
            isReplicationRole?: boolean;
            canBypassRls?: boolean;
            connectionLimit?: number;
            password?: string;
            validUntil?: string;
        }) => {
            sql: string;
        };
        remove: (identifier: Pick<{
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, "id"> | Pick<{
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, "name">, { ifExists }?: {
            ifExists?: boolean;
        }) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            name: import("zod").ZodString;
            isSuperuser: import("zod").ZodBoolean;
            canCreateDb: import("zod").ZodBoolean;
            canCreateRole: import("zod").ZodBoolean;
            inheritRole: import("zod").ZodBoolean;
            canLogin: import("zod").ZodBoolean;
            isReplicationRole: import("zod").ZodBoolean;
            canBypassRls: import("zod").ZodBoolean;
            activeConnections: import("zod").ZodNumber;
            connectionLimit: import("zod").ZodNumber;
            validUntil: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
            config: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }, {
            id: number;
            name: string;
            isSuperuser: boolean;
            canCreateDb: boolean;
            canCreateRole: boolean;
            inheritRole: boolean;
            canLogin: boolean;
            isReplicationRole: boolean;
            canBypassRls: boolean;
            activeConnections: number;
            connectionLimit: number;
            validUntil: string | null;
            config: Record<string, string>;
        }>;
    };
    columns: {
        list: ({ tableId, includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
            tableId?: number;
            includeSystemSchemas?: boolean;
            includedSchemas?: string[];
            excludedSchemas?: string[];
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: typeof import("./pg-meta-columns").pgColumnArrayZod;
        };
        retrieve: (identifier: Pick<{
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
        }, "id"> | Pick<{
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
        }, "schema" | "table" | "name">) => {
            sql: string;
            zod: import("zod").ZodOptional<import("zod").ZodObject<{
                id: import("zod").ZodString;
                table_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                table: import("zod").ZodString;
                name: import("zod").ZodString;
                ordinal_position: import("zod").ZodNumber;
                data_type: import("zod").ZodString;
                format: import("zod").ZodString;
                is_identity: import("zod").ZodBoolean;
                identity_generation: import("zod").ZodNullable<import("zod").ZodString>;
                is_generated: import("zod").ZodBoolean;
                is_nullable: import("zod").ZodBoolean;
                is_updatable: import("zod").ZodBoolean;
                is_unique: import("zod").ZodBoolean;
                check: import("zod").ZodNullable<import("zod").ZodString>;
                default_value: import("zod").ZodNullable<import("zod").ZodAny>;
                enums: import("zod").ZodArray<import("zod").ZodString, "many">;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
            }>>;
        };
        create: ({ schema, table, name, type, default_value, default_value_format, is_identity, identity_generation, is_nullable, is_primary_key, is_unique, comment, check, }: {
            schema: string;
            table: string;
            name: string;
            type: string;
            default_value?: any;
            default_value_format?: "expression" | "literal";
            is_identity?: boolean;
            identity_generation?: "BY DEFAULT" | "ALWAYS";
            is_nullable?: boolean;
            is_primary_key?: boolean;
            is_unique?: boolean;
            comment?: string;
            check?: string;
        }) => {
            sql: string;
        };
        update: (old: Pick<import("./pg-meta-columns").PGColumn, "name" | "schema" | "table" | "table_id" | "ordinal_position" | "is_identity" | "is_unique">, { name, type, drop_default, default_value, default_value_format, is_identity, identity_generation, is_nullable, is_unique, comment, check, }: {
            name?: string;
            type?: string;
            drop_default?: boolean;
            default_value?: any;
            default_value_format?: "expression" | "literal";
            is_identity?: boolean;
            identity_generation?: "BY DEFAULT" | "ALWAYS";
            is_nullable?: boolean;
            is_unique?: boolean;
            comment?: string | null;
            check?: string | null;
        }) => {
            sql: string;
        };
        remove: (column: Pick<import("./pg-meta-columns").PGColumn, "name" | "schema" | "table">, { cascade }?: {
            cascade?: boolean | undefined;
        }) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodString;
            table_id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            table: import("zod").ZodString;
            name: import("zod").ZodString;
            ordinal_position: import("zod").ZodNumber;
            data_type: import("zod").ZodString;
            format: import("zod").ZodString;
            is_identity: import("zod").ZodBoolean;
            identity_generation: import("zod").ZodNullable<import("zod").ZodString>;
            is_generated: import("zod").ZodBoolean;
            is_nullable: import("zod").ZodBoolean;
            is_updatable: import("zod").ZodBoolean;
            is_unique: import("zod").ZodBoolean;
            check: import("zod").ZodNullable<import("zod").ZodString>;
            default_value: import("zod").ZodNullable<import("zod").ZodAny>;
            enums: import("zod").ZodArray<import("zod").ZodString, "many">;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
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
        }>;
    };
    schemas: {
        list: ({ includeSystemSchemas, limit, offset, }?: {
            includeSystemSchemas?: boolean;
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                owner: import("zod").ZodString;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        retrieve: {
            ({ id }: {
                id: number;
            }): {
                sql: string;
                zod: import("zod").ZodOptional<import("zod").ZodObject<{
                    id: import("zod").ZodNumber;
                    name: import("zod").ZodString;
                    owner: import("zod").ZodString;
                    comment: import("zod").ZodNullable<import("zod").ZodString>;
                }, "strip", import("zod").ZodTypeAny, {
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
            };
            ({ name }: {
                name: string;
            }): {
                sql: string;
                zod: import("zod").ZodOptional<import("zod").ZodObject<{
                    id: import("zod").ZodNumber;
                    name: import("zod").ZodString;
                    owner: import("zod").ZodString;
                    comment: import("zod").ZodNullable<import("zod").ZodString>;
                }, "strip", import("zod").ZodTypeAny, {
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
            };
        };
        create: ({ name, owner }: {
            name: string;
            owner?: string;
        }) => {
            sql: string;
        };
        update: {
            ({ id }: {
                id: number;
            }, params: {
                name?: string;
                owner?: string;
            }): {
                sql: string;
            };
            ({ name }: {
                name: string;
            }, params: {
                name?: string;
                owner?: string;
            }): {
                sql: string;
            };
        };
        remove: {
            ({ id }: {
                id: number;
            }, params?: {
                cascade?: boolean;
            }): {
                sql: string;
            };
            ({ name }: {
                name: string;
            }, params?: {
                cascade?: boolean;
            }): {
                sql: string;
            };
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            name: import("zod").ZodString;
            owner: import("zod").ZodString;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
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
    tables: typeof tables;
    functions: typeof functions;
    tablePrivileges: {
        list: ({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
            includeSystemSchemas?: boolean;
            includedSchemas?: string[];
            excludedSchemas?: string[];
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                relation_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                name: import("zod").ZodString;
                kind: import("zod").ZodUnion<[import("zod").ZodLiteral<"table">, import("zod").ZodLiteral<"view">, import("zod").ZodLiteral<"materialized_view">, import("zod").ZodLiteral<"foreign_table">, import("zod").ZodLiteral<"partitioned_table">]>;
                privileges: import("zod").ZodArray<import("zod").ZodObject<{
                    grantor: import("zod").ZodString;
                    grantee: import("zod").ZodString;
                    privilege_type: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"TRUNCATE">, import("zod").ZodLiteral<"REFERENCES">, import("zod").ZodLiteral<"TRIGGER">, import("zod").ZodLiteral<"MAINTAIN">]>;
                    is_grantable: import("zod").ZodBoolean;
                }, "strip", import("zod").ZodTypeAny, {
                    grantor: string;
                    grantee: string;
                    privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                    is_grantable: boolean;
                }, {
                    grantor: string;
                    grantee: string;
                    privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                    is_grantable: boolean;
                }>, "many">;
            }, "strip", import("zod").ZodTypeAny, {
                privileges: {
                    grantor: string;
                    grantee: string;
                    privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                    is_grantable: boolean;
                }[];
                schema: string;
                name: string;
                relation_id: number;
                kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
            }, {
                privileges: {
                    grantor: string;
                    grantee: string;
                    privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                    is_grantable: boolean;
                }[];
                schema: string;
                name: string;
                relation_id: number;
                kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
            }>, "many">;
        };
        retrieve: {
            ({ id }: {
                id: number;
            }): {
                sql: string;
                zod: import("zod").ZodOptional<import("zod").ZodObject<{
                    relation_id: import("zod").ZodNumber;
                    schema: import("zod").ZodString;
                    name: import("zod").ZodString;
                    kind: import("zod").ZodUnion<[import("zod").ZodLiteral<"table">, import("zod").ZodLiteral<"view">, import("zod").ZodLiteral<"materialized_view">, import("zod").ZodLiteral<"foreign_table">, import("zod").ZodLiteral<"partitioned_table">]>;
                    privileges: import("zod").ZodArray<import("zod").ZodObject<{
                        grantor: import("zod").ZodString;
                        grantee: import("zod").ZodString;
                        privilege_type: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"TRUNCATE">, import("zod").ZodLiteral<"REFERENCES">, import("zod").ZodLiteral<"TRIGGER">, import("zod").ZodLiteral<"MAINTAIN">]>;
                        is_grantable: import("zod").ZodBoolean;
                    }, "strip", import("zod").ZodTypeAny, {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }, {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }>, "many">;
                }, "strip", import("zod").ZodTypeAny, {
                    privileges: {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }[];
                    schema: string;
                    name: string;
                    relation_id: number;
                    kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
                }, {
                    privileges: {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }[];
                    schema: string;
                    name: string;
                    relation_id: number;
                    kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
                }>>;
            };
            ({ name, schema }: {
                name: string;
                schema?: string;
            }): {
                sql: string;
                zod: import("zod").ZodOptional<import("zod").ZodObject<{
                    relation_id: import("zod").ZodNumber;
                    schema: import("zod").ZodString;
                    name: import("zod").ZodString;
                    kind: import("zod").ZodUnion<[import("zod").ZodLiteral<"table">, import("zod").ZodLiteral<"view">, import("zod").ZodLiteral<"materialized_view">, import("zod").ZodLiteral<"foreign_table">, import("zod").ZodLiteral<"partitioned_table">]>;
                    privileges: import("zod").ZodArray<import("zod").ZodObject<{
                        grantor: import("zod").ZodString;
                        grantee: import("zod").ZodString;
                        privilege_type: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"TRUNCATE">, import("zod").ZodLiteral<"REFERENCES">, import("zod").ZodLiteral<"TRIGGER">, import("zod").ZodLiteral<"MAINTAIN">]>;
                        is_grantable: import("zod").ZodBoolean;
                    }, "strip", import("zod").ZodTypeAny, {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }, {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }>, "many">;
                }, "strip", import("zod").ZodTypeAny, {
                    privileges: {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }[];
                    schema: string;
                    name: string;
                    relation_id: number;
                    kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
                }, {
                    privileges: {
                        grantor: string;
                        grantee: string;
                        privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                        is_grantable: boolean;
                    }[];
                    schema: string;
                    name: string;
                    relation_id: number;
                    kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
                }>>;
            };
        };
        grant: (grants: {
            relationId: number;
            grantee: string;
            privilegeType: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" | "REFERENCES" | "TRIGGER" | "MAINTAIN";
            isGrantable?: boolean;
        }[]) => {
            sql: string;
        };
        revoke: (revokes: {
            relationId: number;
            grantee: string;
            privilegeType: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE" | "REFERENCES" | "TRIGGER" | "MAINTAIN";
        }[]) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            relation_id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            name: import("zod").ZodString;
            kind: import("zod").ZodUnion<[import("zod").ZodLiteral<"table">, import("zod").ZodLiteral<"view">, import("zod").ZodLiteral<"materialized_view">, import("zod").ZodLiteral<"foreign_table">, import("zod").ZodLiteral<"partitioned_table">]>;
            privileges: import("zod").ZodArray<import("zod").ZodObject<{
                grantor: import("zod").ZodString;
                grantee: import("zod").ZodString;
                privilege_type: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"TRUNCATE">, import("zod").ZodLiteral<"REFERENCES">, import("zod").ZodLiteral<"TRIGGER">, import("zod").ZodLiteral<"MAINTAIN">]>;
                is_grantable: import("zod").ZodBoolean;
            }, "strip", import("zod").ZodTypeAny, {
                grantor: string;
                grantee: string;
                privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                is_grantable: boolean;
            }, {
                grantor: string;
                grantee: string;
                privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                is_grantable: boolean;
            }>, "many">;
        }, "strip", import("zod").ZodTypeAny, {
            privileges: {
                grantor: string;
                grantee: string;
                privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                is_grantable: boolean;
            }[];
            schema: string;
            name: string;
            relation_id: number;
            kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
        }, {
            privileges: {
                grantor: string;
                grantee: string;
                privilege_type: "DELETE" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE" | "TRUNCATE" | "TRIGGER" | "MAINTAIN";
                is_grantable: boolean;
            }[];
            schema: string;
            name: string;
            relation_id: number;
            kind: "table" | "view" | "materialized_view" | "foreign_table" | "partitioned_table";
        }>;
    };
    publications: {
        list: ({ limit, offset, }?: {
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                owner: import("zod").ZodString;
                publish_insert: import("zod").ZodBoolean;
                publish_update: import("zod").ZodBoolean;
                publish_delete: import("zod").ZodBoolean;
                publish_truncate: import("zod").ZodBoolean;
                tables: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodObject<{
                    id: import("zod").ZodOptional<import("zod").ZodNumber>;
                    name: import("zod").ZodString;
                    schema: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    schema: string;
                    name: string;
                    id?: number | undefined;
                }, {
                    schema: string;
                    name: string;
                    id?: number | undefined;
                }>, "many">>;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        retrieve: (identifier: Pick<{
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
        }, "id"> | Pick<{
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
        }, "name">) => {
            sql: string;
            zod: import("zod").ZodOptional<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                owner: import("zod").ZodString;
                publish_insert: import("zod").ZodBoolean;
                publish_update: import("zod").ZodBoolean;
                publish_delete: import("zod").ZodBoolean;
                publish_truncate: import("zod").ZodBoolean;
                tables: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodObject<{
                    id: import("zod").ZodOptional<import("zod").ZodNumber>;
                    name: import("zod").ZodString;
                    schema: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    schema: string;
                    name: string;
                    id?: number | undefined;
                }, {
                    schema: string;
                    name: string;
                    id?: number | undefined;
                }>, "many">>;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        create: ({ name, publish_insert, publish_update, publish_delete, publish_truncate, tables, }: {
            name: string;
            publish_insert?: boolean;
            publish_update?: boolean;
            publish_delete?: boolean;
            publish_truncate?: boolean;
            tables?: string[] | null;
        }) => {
            sql: string;
        };
        update: (id: number, { name, owner, publish_insert, publish_update, publish_delete, publish_truncate, tables, }: {
            name?: string;
            owner?: string;
            publish_insert?: boolean;
            publish_update?: boolean;
            publish_delete?: boolean;
            publish_truncate?: boolean;
            tables?: string[] | null;
        }) => {
            sql: string;
        };
        remove: (publication: Pick<import("./pg-meta-publications").PGPublication, "name">) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            name: import("zod").ZodString;
            owner: import("zod").ZodString;
            publish_insert: import("zod").ZodBoolean;
            publish_update: import("zod").ZodBoolean;
            publish_delete: import("zod").ZodBoolean;
            publish_truncate: import("zod").ZodBoolean;
            tables: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodOptional<import("zod").ZodNumber>;
                name: import("zod").ZodString;
                schema: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                schema: string;
                name: string;
                id?: number | undefined;
            }, {
                schema: string;
                name: string;
                id?: number | undefined;
            }>, "many">>;
        }, "strip", import("zod").ZodTypeAny, {
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
    extensions: {
        list: ({ limit, offset, }?: {
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                name: import("zod").ZodString;
                schema: import("zod").ZodNullable<import("zod").ZodString>;
                default_version: import("zod").ZodString;
                installed_version: import("zod").ZodNullable<import("zod").ZodString>;
                comment: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        retrieve: ({ name }: {
            name: string;
        }) => {
            sql: string;
            zod: import("zod").ZodOptional<import("zod").ZodObject<{
                name: import("zod").ZodString;
                schema: import("zod").ZodNullable<import("zod").ZodString>;
                default_version: import("zod").ZodString;
                installed_version: import("zod").ZodNullable<import("zod").ZodString>;
                comment: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        create: ({ name, schema, version, cascade }: {
            name: string;
            schema?: string;
            version?: string;
            cascade?: boolean;
        }) => {
            sql: string;
        };
        update: (name: string, { update, version, schema }: {
            update?: boolean;
            version?: string;
            schema?: string;
        }) => {
            sql: string;
        };
        remove: (name: string, { cascade }?: {
            cascade?: boolean;
        }) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            name: import("zod").ZodString;
            schema: import("zod").ZodNullable<import("zod").ZodString>;
            default_version: import("zod").ZodString;
            installed_version: import("zod").ZodNullable<import("zod").ZodString>;
            comment: import("zod").ZodString;
        }, "strip", import("zod").ZodTypeAny, {
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
    config: {
        list: ({ limit, offset, }?: {
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                name: import("zod").ZodString;
                setting: import("zod").ZodString;
                category: import("zod").ZodString;
                group: import("zod").ZodString;
                subgroup: import("zod").ZodString;
                unit: import("zod").ZodNullable<import("zod").ZodString>;
                short_desc: import("zod").ZodString;
                extra_desc: import("zod").ZodNullable<import("zod").ZodString>;
                context: import("zod").ZodString;
                vartype: import("zod").ZodString;
                source: import("zod").ZodString;
                min_val: import("zod").ZodNullable<import("zod").ZodString>;
                max_val: import("zod").ZodNullable<import("zod").ZodString>;
                enumvals: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodString, "many">>;
                boot_val: import("zod").ZodNullable<import("zod").ZodString>;
                reset_val: import("zod").ZodNullable<import("zod").ZodString>;
                sourcefile: import("zod").ZodNullable<import("zod").ZodString>;
                sourceline: import("zod").ZodNullable<import("zod").ZodNumber>;
                pending_restart: import("zod").ZodBoolean;
            }, "strip", import("zod").ZodTypeAny, {
                name: string;
                setting: string;
                category: string;
                group: string;
                subgroup: string;
                unit: string | null;
                short_desc: string;
                extra_desc: string | null;
                context: string;
                vartype: string;
                source: string;
                min_val: string | null;
                max_val: string | null;
                enumvals: string[] | null;
                boot_val: string | null;
                reset_val: string | null;
                sourcefile: string | null;
                sourceline: number | null;
                pending_restart: boolean;
            }, {
                name: string;
                setting: string;
                category: string;
                group: string;
                subgroup: string;
                unit: string | null;
                short_desc: string;
                extra_desc: string | null;
                context: string;
                vartype: string;
                source: string;
                min_val: string | null;
                max_val: string | null;
                enumvals: string[] | null;
                boot_val: string | null;
                reset_val: string | null;
                sourcefile: string | null;
                sourceline: number | null;
                pending_restart: boolean;
            }>, "many">;
        };
        zod: import("zod").ZodObject<{
            name: import("zod").ZodString;
            setting: import("zod").ZodString;
            category: import("zod").ZodString;
            group: import("zod").ZodString;
            subgroup: import("zod").ZodString;
            unit: import("zod").ZodNullable<import("zod").ZodString>;
            short_desc: import("zod").ZodString;
            extra_desc: import("zod").ZodNullable<import("zod").ZodString>;
            context: import("zod").ZodString;
            vartype: import("zod").ZodString;
            source: import("zod").ZodString;
            min_val: import("zod").ZodNullable<import("zod").ZodString>;
            max_val: import("zod").ZodNullable<import("zod").ZodString>;
            enumvals: import("zod").ZodNullable<import("zod").ZodArray<import("zod").ZodString, "many">>;
            boot_val: import("zod").ZodNullable<import("zod").ZodString>;
            reset_val: import("zod").ZodNullable<import("zod").ZodString>;
            sourcefile: import("zod").ZodNullable<import("zod").ZodString>;
            sourceline: import("zod").ZodNullable<import("zod").ZodNumber>;
            pending_restart: import("zod").ZodBoolean;
        }, "strip", import("zod").ZodTypeAny, {
            name: string;
            setting: string;
            category: string;
            group: string;
            subgroup: string;
            unit: string | null;
            short_desc: string;
            extra_desc: string | null;
            context: string;
            vartype: string;
            source: string;
            min_val: string | null;
            max_val: string | null;
            enumvals: string[] | null;
            boot_val: string | null;
            reset_val: string | null;
            sourcefile: string | null;
            sourceline: number | null;
            pending_restart: boolean;
        }, {
            name: string;
            setting: string;
            category: string;
            group: string;
            subgroup: string;
            unit: string | null;
            short_desc: string;
            extra_desc: string | null;
            context: string;
            vartype: string;
            source: string;
            min_val: string | null;
            max_val: string | null;
            enumvals: string[] | null;
            boot_val: string | null;
            reset_val: string | null;
            sourcefile: string | null;
            sourceline: number | null;
            pending_restart: boolean;
        }>;
    };
    materializedViews: {
        list: typeof import("./pg-meta-materialized-views").list;
        retrieve: typeof import("./pg-meta-materialized-views").retrieve;
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            name: import("zod").ZodString;
            is_populated: import("zod").ZodBoolean;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
            columns: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                table_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                table: import("zod").ZodString;
                name: import("zod").ZodString;
                ordinal_position: import("zod").ZodNumber;
                data_type: import("zod").ZodString;
                format: import("zod").ZodString;
                is_identity: import("zod").ZodBoolean;
                identity_generation: import("zod").ZodNullable<import("zod").ZodString>;
                is_generated: import("zod").ZodBoolean;
                is_nullable: import("zod").ZodBoolean;
                is_updatable: import("zod").ZodBoolean;
                is_unique: import("zod").ZodBoolean;
                check: import("zod").ZodNullable<import("zod").ZodString>;
                default_value: import("zod").ZodNullable<import("zod").ZodAny>;
                enums: import("zod").ZodArray<import("zod").ZodString, "many">;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
            schema: string;
            name: string;
            comment: string | null;
            is_populated: boolean;
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
            is_populated: boolean;
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
    };
    foreignTables: {
        list: typeof import("./pg-meta-foreign-tables").list;
        retrieve: typeof import("./pg-meta-foreign-tables").retrieve;
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            name: import("zod").ZodString;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
            foreign_server_name: import("zod").ZodString;
            foreign_data_wrapper_name: import("zod").ZodString;
            foreign_data_wrapper_handler: import("zod").ZodString;
            columns: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                table_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                table: import("zod").ZodString;
                name: import("zod").ZodString;
                ordinal_position: import("zod").ZodNumber;
                data_type: import("zod").ZodString;
                format: import("zod").ZodString;
                is_identity: import("zod").ZodBoolean;
                identity_generation: import("zod").ZodNullable<import("zod").ZodString>;
                is_generated: import("zod").ZodBoolean;
                is_nullable: import("zod").ZodBoolean;
                is_updatable: import("zod").ZodBoolean;
                is_unique: import("zod").ZodBoolean;
                check: import("zod").ZodNullable<import("zod").ZodString>;
                default_value: import("zod").ZodNullable<import("zod").ZodAny>;
                enums: import("zod").ZodArray<import("zod").ZodString, "many">;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
            schema: string;
            name: string;
            comment: string | null;
            foreign_server_name: string;
            foreign_data_wrapper_name: string;
            foreign_data_wrapper_handler: string;
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
            foreign_server_name: string;
            foreign_data_wrapper_name: string;
            foreign_data_wrapper_handler: string;
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
    };
    views: {
        list: typeof import("./pg-meta-views").list;
        retrieve: typeof import("./pg-meta-views").retrieve;
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            name: import("zod").ZodString;
            is_updatable: import("zod").ZodBoolean;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
            columns: import("zod").ZodOptional<import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodString;
                table_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                table: import("zod").ZodString;
                name: import("zod").ZodString;
                ordinal_position: import("zod").ZodNumber;
                data_type: import("zod").ZodString;
                format: import("zod").ZodString;
                is_identity: import("zod").ZodBoolean;
                identity_generation: import("zod").ZodNullable<import("zod").ZodString>;
                is_generated: import("zod").ZodBoolean;
                is_nullable: import("zod").ZodBoolean;
                is_updatable: import("zod").ZodBoolean;
                is_unique: import("zod").ZodBoolean;
                check: import("zod").ZodNullable<import("zod").ZodString>;
                default_value: import("zod").ZodNullable<import("zod").ZodAny>;
                enums: import("zod").ZodArray<import("zod").ZodString, "many">;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
        }, "strip", import("zod").ZodTypeAny, {
            id: number;
            schema: string;
            name: string;
            is_updatable: boolean;
            comment: string | null;
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
            is_updatable: boolean;
            comment: string | null;
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
    };
    policies: {
        list: ({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
            includeSystemSchemas?: boolean;
            includedSchemas?: string[];
            excludedSchemas?: string[];
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                table: import("zod").ZodString;
                table_id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                action: import("zod").ZodUnion<[import("zod").ZodLiteral<"PERMISSIVE">, import("zod").ZodLiteral<"RESTRICTIVE">]>;
                roles: import("zod").ZodArray<import("zod").ZodString, "many">;
                command: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"ALL">]>;
                definition: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
                check: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        retrieve: (identifier: Pick<{
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
        }, "id"> | Pick<{
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
        }, "schema" | "table" | "name">) => {
            sql: string;
            zod: import("zod").ZodOptional<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                table: import("zod").ZodString;
                table_id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                action: import("zod").ZodUnion<[import("zod").ZodLiteral<"PERMISSIVE">, import("zod").ZodLiteral<"RESTRICTIVE">]>;
                roles: import("zod").ZodArray<import("zod").ZodString, "many">;
                command: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"ALL">]>;
                definition: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
                check: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        create: ({ name, schema, table, definition, check, action, command, roles, }: {
            name: string;
            schema?: string;
            table: string;
            definition?: string;
            check?: string;
            action?: "PERMISSIVE" | "RESTRICTIVE";
            command?: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
            roles?: string[];
        }) => {
            sql: string;
        };
        update: (identifier: Pick<import("./pg-meta-policies").PGPolicy, "name" | "schema" | "table">, params: {
            name?: string;
            definition?: string;
            check?: string;
            roles?: string[];
        }) => {
            sql: string;
        };
        remove: (identifier: Pick<import("./pg-meta-policies").PGPolicy, "name" | "schema" | "table">) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            table: import("zod").ZodString;
            table_id: import("zod").ZodNumber;
            name: import("zod").ZodString;
            action: import("zod").ZodUnion<[import("zod").ZodLiteral<"PERMISSIVE">, import("zod").ZodLiteral<"RESTRICTIVE">]>;
            roles: import("zod").ZodArray<import("zod").ZodString, "many">;
            command: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"DELETE">, import("zod").ZodLiteral<"ALL">]>;
            definition: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
            check: import("zod").ZodUnion<[import("zod").ZodString, import("zod").ZodNull]>;
        }, "strip", import("zod").ZodTypeAny, {
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
    triggers: {
        list: typeof import("./pg-meta-triggers").list;
        retrieve: typeof import("./pg-meta-triggers").retrieve;
        create: typeof import("./pg-meta-triggers").create;
        update: typeof import("./pg-meta-triggers").update;
        remove: typeof import("./pg-meta-triggers").remove;
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            table_id: import("zod").ZodNumber;
            enabled_mode: import("zod").ZodEnum<["DISABLED", "ORIGIN", "REPLICA", "ALWAYS"]>;
            function_args: import("zod").ZodArray<import("zod").ZodString, "many">;
            name: import("zod").ZodString;
            table: import("zod").ZodString;
            schema: import("zod").ZodString;
            condition: import("zod").ZodNullable<import("zod").ZodString>;
            orientation: import("zod").ZodString;
            activation: import("zod").ZodString;
            events: import("zod").ZodArray<import("zod").ZodString, "many">;
            function_name: import("zod").ZodString;
            function_schema: import("zod").ZodString;
        }, "strip", import("zod").ZodTypeAny, {
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
    types: {
        list: ({ includeArrayTypes, includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
            includeArrayTypes?: boolean;
            includeSystemSchemas?: boolean;
            includedSchemas?: string[];
            excludedSchemas?: string[];
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                name: import("zod").ZodString;
                schema: import("zod").ZodString;
                format: import("zod").ZodString;
                enums: import("zod").ZodArray<import("zod").ZodString, "many">;
                attributes: import("zod").ZodArray<import("zod").ZodObject<{
                    name: import("zod").ZodString;
                    type_id: import("zod").ZodNumber;
                }, "strip", import("zod").ZodTypeAny, {
                    name: string;
                    type_id: number;
                }, {
                    name: string;
                    type_id: number;
                }>, "many">;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
            }, "strip", import("zod").ZodTypeAny, {
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
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            name: import("zod").ZodString;
            schema: import("zod").ZodString;
            format: import("zod").ZodString;
            enums: import("zod").ZodArray<import("zod").ZodString, "many">;
            attributes: import("zod").ZodArray<import("zod").ZodObject<{
                name: import("zod").ZodString;
                type_id: import("zod").ZodNumber;
            }, "strip", import("zod").ZodTypeAny, {
                name: string;
                type_id: number;
            }, {
                name: string;
                type_id: number;
            }>, "many">;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
        }, "strip", import("zod").ZodTypeAny, {
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
    version: {
        retrieve: () => {
            sql: string;
            zod: import("zod").ZodObject<{
                version: import("zod").ZodString;
                version_number: import("zod").ZodNumber;
                active_connections: import("zod").ZodNumber;
                max_connections: import("zod").ZodNumber;
            }, "strip", import("zod").ZodTypeAny, {
                version: string;
                version_number: number;
                active_connections: number;
                max_connections: number;
            }, {
                version: string;
                version_number: number;
                active_connections: number;
                max_connections: number;
            }>;
        };
        zod: import("zod").ZodObject<{
            version: import("zod").ZodString;
            version_number: import("zod").ZodNumber;
            active_connections: import("zod").ZodNumber;
            max_connections: import("zod").ZodNumber;
        }, "strip", import("zod").ZodTypeAny, {
            version: string;
            version_number: number;
            active_connections: number;
            max_connections: number;
        }, {
            version: string;
            version_number: number;
            active_connections: number;
            max_connections: number;
        }>;
    };
    indexes: {
        list: ({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
            includeSystemSchemas?: boolean;
            includedSchemas?: string[];
            excludedSchemas?: string[];
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                table_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                number_of_attributes: import("zod").ZodNumber;
                number_of_key_attributes: import("zod").ZodNumber;
                is_unique: import("zod").ZodBoolean;
                is_primary: import("zod").ZodBoolean;
                is_exclusion: import("zod").ZodBoolean;
                is_immediate: import("zod").ZodBoolean;
                is_clustered: import("zod").ZodBoolean;
                is_valid: import("zod").ZodBoolean;
                check_xmin: import("zod").ZodBoolean;
                is_ready: import("zod").ZodBoolean;
                is_live: import("zod").ZodBoolean;
                is_replica_identity: import("zod").ZodBoolean;
                key_attributes: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                collation: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                class: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                options: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                index_predicate: import("zod").ZodNullable<import("zod").ZodString>;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
                index_definition: import("zod").ZodString;
                access_method: import("zod").ZodString;
                index_attributes: import("zod").ZodArray<import("zod").ZodObject<{
                    attribute_number: import("zod").ZodNumber;
                    attribute_name: import("zod").ZodString;
                    data_type: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }, {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }>, "many">;
            }, "strip", import("zod").ZodTypeAny, {
                options: number[];
                id: number;
                table_id: number;
                schema: string;
                is_unique: boolean;
                comment: string | null;
                number_of_attributes: number;
                number_of_key_attributes: number;
                is_primary: boolean;
                is_exclusion: boolean;
                is_immediate: boolean;
                is_clustered: boolean;
                is_valid: boolean;
                check_xmin: boolean;
                is_ready: boolean;
                is_live: boolean;
                is_replica_identity: boolean;
                key_attributes: number[];
                collation: number[];
                class: number[];
                index_predicate: string | null;
                index_definition: string;
                access_method: string;
                index_attributes: {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }[];
            }, {
                options: number[];
                id: number;
                table_id: number;
                schema: string;
                is_unique: boolean;
                comment: string | null;
                number_of_attributes: number;
                number_of_key_attributes: number;
                is_primary: boolean;
                is_exclusion: boolean;
                is_immediate: boolean;
                is_clustered: boolean;
                is_valid: boolean;
                check_xmin: boolean;
                is_ready: boolean;
                is_live: boolean;
                is_replica_identity: boolean;
                key_attributes: number[];
                collation: number[];
                class: number[];
                index_predicate: string | null;
                index_definition: string;
                access_method: string;
                index_attributes: {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }[];
            }>, "many">;
        };
        retrieve: ({ id }: {
            id: number;
        }) => {
            sql: string;
            zod: import("zod").ZodOptional<import("zod").ZodObject<{
                id: import("zod").ZodNumber;
                table_id: import("zod").ZodNumber;
                schema: import("zod").ZodString;
                number_of_attributes: import("zod").ZodNumber;
                number_of_key_attributes: import("zod").ZodNumber;
                is_unique: import("zod").ZodBoolean;
                is_primary: import("zod").ZodBoolean;
                is_exclusion: import("zod").ZodBoolean;
                is_immediate: import("zod").ZodBoolean;
                is_clustered: import("zod").ZodBoolean;
                is_valid: import("zod").ZodBoolean;
                check_xmin: import("zod").ZodBoolean;
                is_ready: import("zod").ZodBoolean;
                is_live: import("zod").ZodBoolean;
                is_replica_identity: import("zod").ZodBoolean;
                key_attributes: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                collation: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                class: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                options: import("zod").ZodArray<import("zod").ZodNumber, "many">;
                index_predicate: import("zod").ZodNullable<import("zod").ZodString>;
                comment: import("zod").ZodNullable<import("zod").ZodString>;
                index_definition: import("zod").ZodString;
                access_method: import("zod").ZodString;
                index_attributes: import("zod").ZodArray<import("zod").ZodObject<{
                    attribute_number: import("zod").ZodNumber;
                    attribute_name: import("zod").ZodString;
                    data_type: import("zod").ZodString;
                }, "strip", import("zod").ZodTypeAny, {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }, {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }>, "many">;
            }, "strip", import("zod").ZodTypeAny, {
                options: number[];
                id: number;
                table_id: number;
                schema: string;
                is_unique: boolean;
                comment: string | null;
                number_of_attributes: number;
                number_of_key_attributes: number;
                is_primary: boolean;
                is_exclusion: boolean;
                is_immediate: boolean;
                is_clustered: boolean;
                is_valid: boolean;
                check_xmin: boolean;
                is_ready: boolean;
                is_live: boolean;
                is_replica_identity: boolean;
                key_attributes: number[];
                collation: number[];
                class: number[];
                index_predicate: string | null;
                index_definition: string;
                access_method: string;
                index_attributes: {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }[];
            }, {
                options: number[];
                id: number;
                table_id: number;
                schema: string;
                is_unique: boolean;
                comment: string | null;
                number_of_attributes: number;
                number_of_key_attributes: number;
                is_primary: boolean;
                is_exclusion: boolean;
                is_immediate: boolean;
                is_clustered: boolean;
                is_valid: boolean;
                check_xmin: boolean;
                is_ready: boolean;
                is_live: boolean;
                is_replica_identity: boolean;
                key_attributes: number[];
                collation: number[];
                class: number[];
                index_predicate: string | null;
                index_definition: string;
                access_method: string;
                index_attributes: {
                    data_type: string;
                    attribute_number: number;
                    attribute_name: string;
                }[];
            }>>;
        };
        zod: import("zod").ZodObject<{
            id: import("zod").ZodNumber;
            table_id: import("zod").ZodNumber;
            schema: import("zod").ZodString;
            number_of_attributes: import("zod").ZodNumber;
            number_of_key_attributes: import("zod").ZodNumber;
            is_unique: import("zod").ZodBoolean;
            is_primary: import("zod").ZodBoolean;
            is_exclusion: import("zod").ZodBoolean;
            is_immediate: import("zod").ZodBoolean;
            is_clustered: import("zod").ZodBoolean;
            is_valid: import("zod").ZodBoolean;
            check_xmin: import("zod").ZodBoolean;
            is_ready: import("zod").ZodBoolean;
            is_live: import("zod").ZodBoolean;
            is_replica_identity: import("zod").ZodBoolean;
            key_attributes: import("zod").ZodArray<import("zod").ZodNumber, "many">;
            collation: import("zod").ZodArray<import("zod").ZodNumber, "many">;
            class: import("zod").ZodArray<import("zod").ZodNumber, "many">;
            options: import("zod").ZodArray<import("zod").ZodNumber, "many">;
            index_predicate: import("zod").ZodNullable<import("zod").ZodString>;
            comment: import("zod").ZodNullable<import("zod").ZodString>;
            index_definition: import("zod").ZodString;
            access_method: import("zod").ZodString;
            index_attributes: import("zod").ZodArray<import("zod").ZodObject<{
                attribute_number: import("zod").ZodNumber;
                attribute_name: import("zod").ZodString;
                data_type: import("zod").ZodString;
            }, "strip", import("zod").ZodTypeAny, {
                data_type: string;
                attribute_number: number;
                attribute_name: string;
            }, {
                data_type: string;
                attribute_number: number;
                attribute_name: string;
            }>, "many">;
        }, "strip", import("zod").ZodTypeAny, {
            options: number[];
            id: number;
            table_id: number;
            schema: string;
            is_unique: boolean;
            comment: string | null;
            number_of_attributes: number;
            number_of_key_attributes: number;
            is_primary: boolean;
            is_exclusion: boolean;
            is_immediate: boolean;
            is_clustered: boolean;
            is_valid: boolean;
            check_xmin: boolean;
            is_ready: boolean;
            is_live: boolean;
            is_replica_identity: boolean;
            key_attributes: number[];
            collation: number[];
            class: number[];
            index_predicate: string | null;
            index_definition: string;
            access_method: string;
            index_attributes: {
                data_type: string;
                attribute_number: number;
                attribute_name: string;
            }[];
        }, {
            options: number[];
            id: number;
            table_id: number;
            schema: string;
            is_unique: boolean;
            comment: string | null;
            number_of_attributes: number;
            number_of_key_attributes: number;
            is_primary: boolean;
            is_exclusion: boolean;
            is_immediate: boolean;
            is_clustered: boolean;
            is_valid: boolean;
            check_xmin: boolean;
            is_ready: boolean;
            is_live: boolean;
            is_replica_identity: boolean;
            key_attributes: number[];
            collation: number[];
            class: number[];
            index_predicate: string | null;
            index_definition: string;
            access_method: string;
            index_attributes: {
                data_type: string;
                attribute_number: number;
                attribute_name: string;
            }[];
        }>;
    };
    columnPrivileges: {
        list: ({ includeSystemSchemas, includedSchemas, excludedSchemas, columnIds, limit, offset, }?: {
            includeSystemSchemas?: boolean;
            includedSchemas?: string[];
            excludedSchemas?: string[];
            columnIds?: string[];
            limit?: number;
            offset?: number;
        }) => {
            sql: string;
            zod: import("zod").ZodArray<import("zod").ZodObject<{
                column_id: import("zod").ZodString;
                relation_schema: import("zod").ZodString;
                relation_name: import("zod").ZodString;
                column_name: import("zod").ZodString;
                privileges: import("zod").ZodArray<import("zod").ZodObject<{
                    grantor: import("zod").ZodString;
                    grantee: import("zod").ZodString;
                    privilege_type: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"REFERENCES">]>;
                    is_grantable: import("zod").ZodBoolean;
                }, "strip", import("zod").ZodTypeAny, {
                    grantor: string;
                    grantee: string;
                    privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                    is_grantable: boolean;
                }, {
                    grantor: string;
                    grantee: string;
                    privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                    is_grantable: boolean;
                }>, "many">;
            }, "strip", import("zod").ZodTypeAny, {
                column_id: string;
                relation_schema: string;
                relation_name: string;
                column_name: string;
                privileges: {
                    grantor: string;
                    grantee: string;
                    privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                    is_grantable: boolean;
                }[];
            }, {
                column_id: string;
                relation_schema: string;
                relation_name: string;
                column_name: string;
                privileges: {
                    grantor: string;
                    grantee: string;
                    privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                    is_grantable: boolean;
                }[];
            }>, "many">;
        };
        grant: (grants: {
            grantee: string;
            columnId: string;
            privilegeType: "ALL" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
            isGrantable?: boolean | undefined;
        }[]) => {
            sql: string;
        };
        revoke: (revokes: {
            grantee: string;
            columnId: string;
            privilegeType: "ALL" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
        }[]) => {
            sql: string;
        };
        zod: import("zod").ZodObject<{
            column_id: import("zod").ZodString;
            relation_schema: import("zod").ZodString;
            relation_name: import("zod").ZodString;
            column_name: import("zod").ZodString;
            privileges: import("zod").ZodArray<import("zod").ZodObject<{
                grantor: import("zod").ZodString;
                grantee: import("zod").ZodString;
                privilege_type: import("zod").ZodUnion<[import("zod").ZodLiteral<"SELECT">, import("zod").ZodLiteral<"INSERT">, import("zod").ZodLiteral<"UPDATE">, import("zod").ZodLiteral<"REFERENCES">]>;
                is_grantable: import("zod").ZodBoolean;
            }, "strip", import("zod").ZodTypeAny, {
                grantor: string;
                grantee: string;
                privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                is_grantable: boolean;
            }, {
                grantor: string;
                grantee: string;
                privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                is_grantable: boolean;
            }>, "many">;
        }, "strip", import("zod").ZodTypeAny, {
            column_id: string;
            relation_schema: string;
            relation_name: string;
            column_name: string;
            privileges: {
                grantor: string;
                grantee: string;
                privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                is_grantable: boolean;
            }[];
        }, {
            column_id: string;
            relation_schema: string;
            relation_name: string;
            column_name: string;
            privileges: {
                grantor: string;
                grantee: string;
                privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
                is_grantable: boolean;
            }[];
        }>;
    };
    query: typeof query;
    getIndexWorkerStatusSQL: () => string;
    getIndexStatusesSQL: () => string;
    USER_SEARCH_INDEXES: string[];
};
export default _default;
//# sourceMappingURL=index.d.ts.map