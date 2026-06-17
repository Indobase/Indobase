import { z } from 'zod';
declare const pgRoleZod: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    isSuperuser: z.ZodBoolean;
    canCreateDb: z.ZodBoolean;
    canCreateRole: z.ZodBoolean;
    inheritRole: z.ZodBoolean;
    canLogin: z.ZodBoolean;
    isReplicationRole: z.ZodBoolean;
    canBypassRls: z.ZodBoolean;
    activeConnections: z.ZodNumber;
    connectionLimit: z.ZodNumber;
    validUntil: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    config: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
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
declare const pgRoleArrayZod: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    isSuperuser: z.ZodBoolean;
    canCreateDb: z.ZodBoolean;
    canCreateRole: z.ZodBoolean;
    inheritRole: z.ZodBoolean;
    canLogin: z.ZodBoolean;
    isReplicationRole: z.ZodBoolean;
    canBypassRls: z.ZodBoolean;
    activeConnections: z.ZodNumber;
    connectionLimit: z.ZodNumber;
    validUntil: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    config: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
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
declare const pgRoleOptionalZod: z.ZodOptional<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    isSuperuser: z.ZodBoolean;
    canCreateDb: z.ZodBoolean;
    canCreateRole: z.ZodBoolean;
    inheritRole: z.ZodBoolean;
    canLogin: z.ZodBoolean;
    isReplicationRole: z.ZodBoolean;
    canBypassRls: z.ZodBoolean;
    activeConnections: z.ZodNumber;
    connectionLimit: z.ZodNumber;
    validUntil: z.ZodUnion<[z.ZodString, z.ZodNull]>;
    config: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
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
export type PGRole = z.infer<typeof pgRoleZod>;
declare function list({ includeDefaultRoles: includeDefaultRoles, limit, offset, }?: {
    includeDefaultRoles?: boolean;
    limit?: number;
    offset?: number;
}): {
    sql: string;
    zod: typeof pgRoleArrayZod;
};
type RoleIdentifier = Pick<PGRole, 'id'> | Pick<PGRole, 'name'>;
declare function retrieve(identifier: RoleIdentifier): {
    sql: string;
    zod: typeof pgRoleOptionalZod;
};
type RoleCreateParams = {
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
};
declare function create({ name, isSuperuser, canCreateDb, canCreateRole, inheritRole, canLogin, isReplicationRole, canBypassRls, connectionLimit, password, validUntil, memberOf, members, admins, config, }: RoleCreateParams): {
    sql: string;
};
type RoleUpdateParams = {
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
};
declare function update(identifier: RoleIdentifier, params: RoleUpdateParams): {
    sql: string;
};
type RoleRemoveParams = {
    ifExists?: boolean;
};
declare function remove(identifier: RoleIdentifier, { ifExists }?: RoleRemoveParams): {
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
        isSuperuser: z.ZodBoolean;
        canCreateDb: z.ZodBoolean;
        canCreateRole: z.ZodBoolean;
        inheritRole: z.ZodBoolean;
        canLogin: z.ZodBoolean;
        isReplicationRole: z.ZodBoolean;
        canBypassRls: z.ZodBoolean;
        activeConnections: z.ZodNumber;
        connectionLimit: z.ZodNumber;
        validUntil: z.ZodUnion<[z.ZodString, z.ZodNull]>;
        config: z.ZodRecord<z.ZodString, z.ZodString>;
    }, "strip", z.ZodTypeAny, {
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
export default _default;
//# sourceMappingURL=pg-meta-roles.d.ts.map