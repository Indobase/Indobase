import { IQueryModifier, QueryModifier } from './QueryModifier';
import type { Dictionary, Filter, FilterOperator, QueryTable, Sort } from './types';
export interface IQueryFilter {
    filter: (column: string, operator: FilterOperator, value: string) => IQueryFilter;
    match: (criteria: Dictionary<any>) => IQueryFilter;
    order: (table: string, column: string, ascending?: boolean, nullsFirst?: boolean) => IQueryFilter;
}
export declare class QueryFilter implements IQueryFilter, IQueryModifier {
    protected table: QueryTable;
    protected action: 'count' | 'delete' | 'insert' | 'select' | 'update' | 'truncate';
    protected actionValue?: (string | string[] | Dictionary<any> | Dictionary<any>[]) | undefined;
    protected actionOptions?: {
        returning: boolean;
        enumArrayColumns?: string[];
    } | undefined;
    protected filters: Filter[];
    protected sorts: Sort[];
    constructor(table: QueryTable, action: 'count' | 'delete' | 'insert' | 'select' | 'update' | 'truncate', actionValue?: (string | string[] | Dictionary<any> | Dictionary<any>[]) | undefined, actionOptions?: {
        returning: boolean;
        enumArrayColumns?: string[];
    } | undefined);
    filter(column: string | string[], operator: FilterOperator, value: any): this;
    match(criteria: Dictionary<any>): this;
    order(table: string, column: string, ascending?: boolean, nullsFirst?: boolean): this;
    range(from: number, to: number): QueryModifier;
    clone(): QueryFilter;
    toSql(options?: {
        isCTE: boolean;
        isFinal: boolean;
    }): string;
    _getQueryModifier(): QueryModifier;
}
//# sourceMappingURL=QueryFilter.d.ts.map