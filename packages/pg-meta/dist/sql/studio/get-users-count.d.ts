import type { OptimizedSearchColumns } from './get-users-types';
export declare const USERS_COUNT_ESTIMATE_SQL = "select reltuples as estimate from pg_class where oid = 'auth.users'::regclass";
export declare const getUsersCountSQL: ({ filter, keywords, providers, forceExactCount, column, scopedUserId, }: {
    filter?: "verified" | "unverified" | "anonymous";
    keywords?: string;
    providers?: string[];
    forceExactCount?: boolean;
    /** If set, uses optimized prefix search for the specified column */
    column?: OptimizedSearchColumns;
    scopedUserId?: string;
}) => string;
//# sourceMappingURL=get-users-count.d.ts.map