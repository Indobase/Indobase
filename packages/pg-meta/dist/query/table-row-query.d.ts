import { PGForeignTable } from '../pg-meta-foreign-tables';
import { PGMaterializedView } from '../pg-meta-materialized-views';
import { PGTable } from '../pg-meta-tables';
import { PGView } from '../pg-meta-views';
import { Filter, Sort } from './types';
export declare const MAX_CHARACTERS: number;
export declare const MAX_ARRAY_SIZE = 50;
export type TableLikeEntity = PGTable | PGView | PGForeignTable | PGMaterializedView;
export interface BuildTableRowsQueryArgs {
    table: TableLikeEntity;
    filters?: Filter[];
    sorts?: Sort[];
    limit?: number;
    page?: number;
    maxCharacters?: number;
    maxArraySize?: number;
    /**
     * Columns that should not be used for default sorting
     */
    sortExcludedColumns?: string[];
}
export declare const TEXT_TYPES: string[];
export declare const JSON_TYPES: string[];
export declare const ADDITIONAL_LARGE_TYPES: string[];
export declare const LARGE_COLUMNS_TYPES: string[];
export declare const THRESHOLD_COUNT = 100000;
export declare const getDefaultOrderByColumns: (table: Pick<PGTable, "primary_keys" | "columns">, { excludedColumns }?: {
    excludedColumns?: string[];
}) => string[];
/**
 * Determines if a column type should be truncated based on its format and dataType
 * Be aware if the logic in RowEditor.utils.ts -> isValueTruncated needs to be revised
 * if we're updating the truncation logic, as it'll affect whether the Table Editor displays
 * the data as truncated or not
 */
export declare const shouldTruncateColumn: (columnFormat: string) => boolean;
export declare const DEFAULT_PAGE_SIZE = 100;
export declare function getPagination(page?: number, size?: number): {
    from: number;
    to: number;
};
export declare const getTableRowsSql: ({ table, filters, sorts, page, limit, maxCharacters, maxArraySize, sortExcludedColumns, }: BuildTableRowsQueryArgs) => string;
declare const _default: {
    shouldTruncateColumn: (columnFormat: string) => boolean;
    getTableRowsSql: ({ table, filters, sorts, page, limit, maxCharacters, maxArraySize, sortExcludedColumns, }: BuildTableRowsQueryArgs) => string;
    getDefaultOrderByColumns: (table: Pick<PGTable, "primary_keys" | "columns">, { excludedColumns }?: {
        excludedColumns?: string[];
    }) => string[];
};
export default _default;
//# sourceMappingURL=table-row-query.d.ts.map