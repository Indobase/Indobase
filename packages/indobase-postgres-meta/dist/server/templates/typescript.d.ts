import type { PostgresFunction, PostgresMaterializedView, PostgresSchema, PostgresTable, PostgresType, PostgresView } from '../../lib/index.js';
export declare const apply: ({ schemas, tables, views, materializedViews, functions, types, arrayTypes, }: {
    schemas: PostgresSchema[];
    tables: (PostgresTable & {
        columns: unknown[];
    })[];
    views: (PostgresView & {
        columns: unknown[];
    })[];
    materializedViews: (PostgresMaterializedView & {
        columns: unknown[];
    })[];
    functions: PostgresFunction[];
    types: PostgresType[];
    arrayTypes: PostgresType[];
}) => string;
//# sourceMappingURL=typescript.d.ts.map