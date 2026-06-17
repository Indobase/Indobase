import type { Dictionary, Filter, QueryPagination, QueryTable, Sort } from './types';
export interface IQueryModifier {
    range: (from: number, to: number) => QueryModifier;
    toSql: () => string;
}
export declare class QueryModifier implements IQueryModifier {
    protected table: QueryTable;
    protected action: 'count' | 'delete' | 'insert' | 'select' | 'update' | 'truncate';
    protected options?: {
        actionValue?: string | string[] | Dictionary<any> | Dictionary<any>[];
        actionOptions?: {
            returning?: boolean;
            cascade?: boolean;
            enumArrayColumns?: string[];
        };
        filters?: Filter[];
        sorts?: Sort[];
    } | undefined;
    protected pagination?: QueryPagination;
    constructor(table: QueryTable, action: 'count' | 'delete' | 'insert' | 'select' | 'update' | 'truncate', options?: {
        actionValue?: string | string[] | Dictionary<any> | Dictionary<any>[];
        actionOptions?: {
            returning?: boolean;
            cascade?: boolean;
            enumArrayColumns?: string[];
        };
        filters?: Filter[];
        sorts?: Sort[];
    } | undefined);
    /**
     * Limits the result to rows within the specified range, inclusive.
     *
     * @param from  The starting index from which to limit the result, inclusive.
     * @param to  The last index to which to limit the result, inclusive.
     */
    range(from: number, to: number): this;
    /**
     * Return SQL string for query chains
     */
    toSql(options?: {
        isCTE: boolean;
        isFinal: boolean;
    }): string;
}
//# sourceMappingURL=QueryModifier.d.ts.map