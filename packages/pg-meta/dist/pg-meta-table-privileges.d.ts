import { z } from 'zod';
declare const pgTablePrivilegesArrayZod: z.ZodArray<z.ZodObject<{
    relation_id: z.ZodNumber;
    schema: z.ZodString;
    name: z.ZodString;
    kind: z.ZodUnion<[z.ZodLiteral<"table">, z.ZodLiteral<"view">, z.ZodLiteral<"materialized_view">, z.ZodLiteral<"foreign_table">, z.ZodLiteral<"partitioned_table">]>;
    privileges: z.ZodArray<z.ZodObject<{
        grantor: z.ZodString;
        grantee: z.ZodString;
        privilege_type: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"TRUNCATE">, z.ZodLiteral<"REFERENCES">, z.ZodLiteral<"TRIGGER">, z.ZodLiteral<"MAINTAIN">]>;
        is_grantable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
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
}, "strip", z.ZodTypeAny, {
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
declare const pgTablePrivilegesOptionalZod: z.ZodOptional<z.ZodObject<{
    relation_id: z.ZodNumber;
    schema: z.ZodString;
    name: z.ZodString;
    kind: z.ZodUnion<[z.ZodLiteral<"table">, z.ZodLiteral<"view">, z.ZodLiteral<"materialized_view">, z.ZodLiteral<"foreign_table">, z.ZodLiteral<"partitioned_table">]>;
    privileges: z.ZodArray<z.ZodObject<{
        grantor: z.ZodString;
        grantee: z.ZodString;
        privilege_type: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"TRUNCATE">, z.ZodLiteral<"REFERENCES">, z.ZodLiteral<"TRIGGER">, z.ZodLiteral<"MAINTAIN">]>;
        is_grantable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
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
}, "strip", z.ZodTypeAny, {
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
declare function list({ includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgTablePrivilegesArrayZod;
};
declare function retrieve({ id }: {
    id: number;
}): {
    sql: string;
    zod: typeof pgTablePrivilegesOptionalZod;
};
declare function retrieve({ name, schema }: {
    name: string;
    schema?: string;
}): {
    sql: string;
    zod: typeof pgTablePrivilegesOptionalZod;
};
type TablePrivilegesGrant = {
    relationId: number;
    grantee: string;
    privilegeType: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | 'REFERENCES' | 'TRIGGER' | 'MAINTAIN';
    isGrantable?: boolean;
};
declare function grant(grants: TablePrivilegesGrant[]): {
    sql: string;
};
type TablePrivilegesRevoke = {
    relationId: number;
    grantee: string;
    privilegeType: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | 'REFERENCES' | 'TRIGGER' | 'MAINTAIN';
};
declare function revoke(revokes: TablePrivilegesRevoke[]): {
    sql: string;
};
declare const _default: {
    list: typeof list;
    retrieve: typeof retrieve;
    grant: typeof grant;
    revoke: typeof revoke;
    zod: z.ZodObject<{
        relation_id: z.ZodNumber;
        schema: z.ZodString;
        name: z.ZodString;
        kind: z.ZodUnion<[z.ZodLiteral<"table">, z.ZodLiteral<"view">, z.ZodLiteral<"materialized_view">, z.ZodLiteral<"foreign_table">, z.ZodLiteral<"partitioned_table">]>;
        privileges: z.ZodArray<z.ZodObject<{
            grantor: z.ZodString;
            grantee: z.ZodString;
            privilege_type: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"DELETE">, z.ZodLiteral<"TRUNCATE">, z.ZodLiteral<"REFERENCES">, z.ZodLiteral<"TRIGGER">, z.ZodLiteral<"MAINTAIN">]>;
            is_grantable: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
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
    }, "strip", z.ZodTypeAny, {
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
export default _default;
//# sourceMappingURL=pg-meta-table-privileges.d.ts.map