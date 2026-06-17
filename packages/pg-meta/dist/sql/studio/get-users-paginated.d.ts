import { OptimizedSearchColumns } from './get-users-types';
export interface UsersCursor {
    sort: string;
    id: string;
}
interface getPaginatedUsersSQLProps {
    page?: number;
    verified?: 'verified' | 'unverified' | 'anonymous';
    keywords?: string;
    providers?: string[];
    sort: string;
    order: 'asc' | 'desc';
    limit?: number;
    /** If set, uses fast queries but these don't allow any sorting so the above parameters are completely ignored. */
    column?: OptimizedSearchColumns;
    startAt?: string;
    /** Cursor for cursor-based pagination (used by improved search) */
    cursor?: UsersCursor;
    improvedSearchEnabled?: boolean;
    scopedUserId?: string;
}
export declare const getPaginatedUsersSQL: ({ page, verified, keywords, providers, sort, order, limit, column, startAt, cursor, scopedUserId, improvedSearchEnabled, }: getPaginatedUsersSQLProps) => string;
/**
 * Generates SQL for improved paginated user search that leverages specific indexes.
 * Uses cursor-based pagination for efficient and consistent paging.
 *
 * Indexes leveraged:
 * - idx_users_email (btree) - for email prefix and exact match searches and sorting by email
 * - idx_users_created_at_desc - for sorting by created_at
 * - idx_users_last_sign_in_at_desc - for sorting by last_sign_in_at
 * - idx_users_name (btree) - for name prefix and exact match searches on raw_user_meta_data->>'name'
 * - users_phone_key (btree) - for phone prefix searches and sorting by phone
 */
export declare const getImprovedPaginatedUsersSQL: ({ column, keywords, verified, providers, sort, order, cursor, limit, scopedUserId, }: getPaginatedUsersSQLProps) => string;
export {};
//# sourceMappingURL=get-users-paginated.d.ts.map