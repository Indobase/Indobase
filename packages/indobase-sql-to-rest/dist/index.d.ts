declare class ParsingError extends Error {
    hint?: string | undefined;
    name: string;
    constructor(message: string, hint?: string | undefined);
}
declare class UnimplementedError extends Error {
    name: string;
}
declare class UnsupportedError extends Error {
    hint?: string | undefined;
    name: string;
    constructor(message: string, hint?: string | undefined);
}
declare class RenderError extends Error {
    renderer: 'http' | 'indobase-js';
    name: string;
    constructor(message: string, renderer: 'http' | 'indobase-js');
}
declare function sentenceCase(value: string): string;
/**
 * Returns hints for common parsing errors.
 */
declare function getParsingErrorHint(message: string): "Did you leave a trailing comma in the select target list?" | "Do you have an incomplete join in the FROM clause?" | undefined;

type Statement = Select;
type Select = {
    type: 'select';
    from: string;
    targets: Target[];
    filter?: Filter;
    sorts?: Sort[];
    limit?: Limit;
};
type Limit = {
    count?: number;
    offset?: number;
};
type LogicalOperator = 'and' | 'or';
type BaseFilter = {
    negate: boolean;
};
type BaseColumnFilter = BaseFilter & {
    type: 'column';
    column: string;
};
type EqColumnFilter = BaseColumnFilter & {
    operator: 'eq';
    value: string | number;
};
type NeqColumnFilter = BaseColumnFilter & {
    operator: 'neq';
    value: string | number;
};
type GtColumnFilter = BaseColumnFilter & {
    operator: 'gt';
    value: string | number;
};
type GteColumnFilter = BaseColumnFilter & {
    operator: 'gte';
    value: string | number;
};
type LtColumnFilter = BaseColumnFilter & {
    operator: 'lt';
    value: string | number;
};
type LteColumnFilter = BaseColumnFilter & {
    operator: 'lte';
    value: string | number;
};
type LikeColumnFilter = BaseColumnFilter & {
    operator: 'like';
    value: string;
};
type IlikeColumnFilter = BaseColumnFilter & {
    operator: 'ilike';
    value: string;
};
type MatchColumnFilter = BaseColumnFilter & {
    operator: 'match';
    value: string;
};
type ImatchColumnFilter = BaseColumnFilter & {
    operator: 'imatch';
    value: string;
};
type IsColumnFilter = BaseColumnFilter & {
    operator: 'is';
    value: null;
};
type InColumnFilter = BaseColumnFilter & {
    operator: 'in';
    value: (string | number)[];
};
type FtsColumnFilter = BaseColumnFilter & {
    operator: 'fts';
    config?: string;
    value: string;
};
type PlainFtsColumnFilter = BaseColumnFilter & {
    operator: 'plfts';
    config?: string;
    value: string;
};
type PhraseFtsColumnFilter = BaseColumnFilter & {
    operator: 'phfts';
    config?: string;
    value: string;
};
type WebSearchFtsColumnFilter = BaseColumnFilter & {
    operator: 'wfts';
    config?: string;
    value: string;
};
type ColumnFilter = EqColumnFilter | NeqColumnFilter | GtColumnFilter | GteColumnFilter | LtColumnFilter | LteColumnFilter | LikeColumnFilter | IlikeColumnFilter | MatchColumnFilter | ImatchColumnFilter | IsColumnFilter | InColumnFilter | FtsColumnFilter | PlainFtsColumnFilter | PhraseFtsColumnFilter | WebSearchFtsColumnFilter;
type LogicalFilter = BaseFilter & {
    type: 'logical';
    operator: LogicalOperator;
    values: Filter[];
};
type Filter = ColumnFilter | LogicalFilter;
/**
 * Represents a direct column target in the select.
 */
type ColumnTarget = {
    type: 'column-target';
    column: string;
    alias?: string;
    cast?: string;
};
type JoinedColumn = {
    relation: string;
    column: string;
};
/**
 * Represents a resource embedding (joined) target in the select.
 */
type EmbeddedTarget = {
    type: 'embedded-target';
    relation: string;
    targets: Target[];
    joinType: 'left' | 'inner';
    joinedColumns: {
        left: JoinedColumn;
        right: JoinedColumn;
    };
    alias?: string;
    flatten?: boolean;
};
type BaseAggregateTarget = {
    type: 'aggregate-target';
    alias?: string;
    outputCast?: string;
};
type ColumnAggregateTarget = BaseAggregateTarget & {
    functionName: string;
    column: string;
    inputCast?: string;
};
/**
 * Special case `count()` aggregate target that works
 * with no column attached.
 */
type CountAggregateTarget = BaseAggregateTarget & {
    type: 'aggregate-target';
    functionName: 'count';
};
/**
 * Represents a aggregate target in the select.
 */
type AggregateTarget = CountAggregateTarget | ColumnAggregateTarget;
type Target = ColumnTarget | AggregateTarget | EmbeddedTarget;
type Sort = {
    column: string;
    direction?: 'asc' | 'desc';
    nulls?: 'first' | 'last';
};
type Relations = {
    primary: {
        name: string;
        alias?: string;
        get reference(): string;
    };
    joined: EmbeddedTarget[];
};

declare const supportedAggregateFunctions: string[];

/**
 * Recursively flattens PostgREST embedded targets.
 */
declare function flattenTargets(targets: Target[]): Target[];
/**
 * Recursively iterates through PostgREST filters and checks if the predicate
 * matches any of them (ie. `some()`).
 */
declare function someFilter(filter: Filter, predicate: (filter: ColumnFilter) => boolean): boolean;
/**
 * Recursively iterates through a PostgREST target list and checks if the predicate
 * matches every one of them (ie. `some()`).
 */
declare function everyTarget(targets: Target[], predicate: (target: ColumnTarget | AggregateTarget, parent?: EmbeddedTarget) => boolean, parent?: EmbeddedTarget): boolean;
/**
 * Recursively iterates through a PostgREST target list and checks if the predicate
 * matches any of them (ie. `some()`).
 */
declare function someTarget(targets: Target[], predicate: (target: ColumnTarget | AggregateTarget, parent?: EmbeddedTarget) => boolean, parent?: EmbeddedTarget): boolean;

/**
 * Coverts SQL into a PostgREST-compatible `Statement`.
 *
 * Expects SQL to contain only one statement.
 *
 * @returns An intermediate `Statement` object that
 * can be rendered to various targets (HTTP, indobase-js, etc).
 */
declare function processSql(sql: string): Promise<Statement>;

type HttpRequest = {
    method: 'GET';
    path: string;
    params: URLSearchParams;
    fullPath: string;
};
/**
 * Renders a `Statement` as an HTTP request.
 */
declare function renderHttp(processed: Statement): Promise<HttpRequest>;
declare function formatHttp(baseUrl: string, httpRequest: HttpRequest): string;
declare function formatCurl(baseUrl: string, httpRequest: HttpRequest): string;

type IndobaseJsQuery = {
    code: string;
};
/**
 * Renders a `Statement` as a indobase-js query.
 */
declare function renderIndobaseJs(processed: Statement): Promise<IndobaseJsQuery>;

export { type AggregateTarget, type BaseAggregateTarget, type BaseColumnFilter, type BaseFilter, type ColumnAggregateTarget, type ColumnFilter, type ColumnTarget, type CountAggregateTarget, type EmbeddedTarget, type EqColumnFilter, type Filter, type FtsColumnFilter, type GtColumnFilter, type GteColumnFilter, type HttpRequest, type IlikeColumnFilter, type ImatchColumnFilter, type InColumnFilter, type IsColumnFilter, type JoinedColumn, type LikeColumnFilter, type Limit, type LogicalFilter, type LogicalOperator, type LtColumnFilter, type LteColumnFilter, type MatchColumnFilter, type NeqColumnFilter, ParsingError, type PhraseFtsColumnFilter, type PlainFtsColumnFilter, type Relations, RenderError, type Select, type Sort, type Statement, type IndobaseJsQuery, type Target, UnimplementedError, UnsupportedError, type WebSearchFtsColumnFilter, everyTarget, flattenTargets, formatCurl, formatHttp, getParsingErrorHint, processSql, renderHttp, renderIndobaseJs, sentenceCase, someFilter, someTarget, supportedAggregateFunctions };
