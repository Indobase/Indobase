import { z } from 'zod';
declare const pgColumnPrivilegesArrayZod: z.ZodArray<z.ZodObject<{
    column_id: z.ZodString;
    relation_schema: z.ZodString;
    relation_name: z.ZodString;
    column_name: z.ZodString;
    privileges: z.ZodArray<z.ZodObject<{
        grantor: z.ZodString;
        grantee: z.ZodString;
        privilege_type: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"REFERENCES">]>;
        is_grantable: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
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
}, "strip", z.ZodTypeAny, {
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
declare const privilegeGrant: z.ZodObject<{
    columnId: z.ZodString;
    grantee: z.ZodString;
    privilegeType: z.ZodUnion<[z.ZodLiteral<"ALL">, z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"REFERENCES">]>;
    isGrantable: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    grantee: string;
    columnId: string;
    privilegeType: "ALL" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
    isGrantable?: boolean | undefined;
}, {
    grantee: string;
    columnId: string;
    privilegeType: "ALL" | "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
    isGrantable?: boolean | undefined;
}>;
declare function list({ includeSystemSchemas, includedSchemas, excludedSchemas, columnIds, limit, offset, }?: {
    includeSystemSchemas?: boolean;
    includedSchemas?: string[];
    excludedSchemas?: string[];
    columnIds?: string[];
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgColumnPrivilegesArrayZod;
};
type ColumnPrivilegesGrant = z.infer<typeof privilegeGrant>;
declare function grant(grants: ColumnPrivilegesGrant[]): {
    sql: string;
};
type ColumnPrivilegesRevoke = Omit<ColumnPrivilegesGrant, 'isGrantable'>;
declare function revoke(revokes: ColumnPrivilegesRevoke[]): {
    sql: string;
};
declare const _default: {
    list: typeof list;
    grant: typeof grant;
    revoke: typeof revoke;
    zod: z.ZodObject<{
        column_id: z.ZodString;
        relation_schema: z.ZodString;
        relation_name: z.ZodString;
        column_name: z.ZodString;
        privileges: z.ZodArray<z.ZodObject<{
            grantor: z.ZodString;
            grantee: z.ZodString;
            privilege_type: z.ZodUnion<[z.ZodLiteral<"SELECT">, z.ZodLiteral<"INSERT">, z.ZodLiteral<"UPDATE">, z.ZodLiteral<"REFERENCES">]>;
            is_grantable: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
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
    }, "strip", z.ZodTypeAny, {
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
export default _default;
//# sourceMappingURL=pg-meta-column-privileges.d.ts.map