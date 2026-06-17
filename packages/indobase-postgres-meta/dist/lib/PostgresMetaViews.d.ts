import { PostgresMetaResult, PostgresView } from './types.js';
export default class PostgresMetaViews {
    query: (sql: string) => Promise<PostgresMetaResult<any>>;
    constructor(query: (sql: string) => Promise<PostgresMetaResult<any>>);
    list(options: {
        includeSystemSchemas?: boolean;
        includedSchemas?: string[];
        excludedSchemas?: string[];
        limit?: number;
        offset?: number;
        includeColumns: false;
    }): Promise<PostgresMetaResult<(PostgresView & {
        columns: never;
    })[]>>;
    list(options?: {
        includeSystemSchemas?: boolean;
        includedSchemas?: string[];
        excludedSchemas?: string[];
        limit?: number;
        offset?: number;
        includeColumns?: boolean;
    }): Promise<PostgresMetaResult<(PostgresView & {
        columns: unknown[];
    })[]>>;
    retrieve({ id }: {
        id: number;
    }): Promise<PostgresMetaResult<PostgresView>>;
    retrieve({ name, schema, }: {
        name: string;
        schema: string;
    }): Promise<PostgresMetaResult<PostgresView>>;
}
//# sourceMappingURL=PostgresMetaViews.d.ts.map