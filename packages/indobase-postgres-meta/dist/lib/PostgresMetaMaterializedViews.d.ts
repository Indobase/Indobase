import { PostgresMetaResult, PostgresMaterializedView } from './types.js';
export default class PostgresMetaMaterializedViews {
    query: (sql: string) => Promise<PostgresMetaResult<any>>;
    constructor(query: (sql: string) => Promise<PostgresMetaResult<any>>);
    list(options: {
        includedSchemas?: string[];
        excludedSchemas?: string[];
        limit?: number;
        offset?: number;
        includeColumns: true;
    }): Promise<PostgresMetaResult<(PostgresMaterializedView & {
        columns: unknown[];
    })[]>>;
    list(options?: {
        includedSchemas?: string[];
        excludedSchemas?: string[];
        limit?: number;
        offset?: number;
        includeColumns?: boolean;
    }): Promise<PostgresMetaResult<(PostgresMaterializedView & {
        columns: never;
    })[]>>;
    retrieve({ id }: {
        id: number;
    }): Promise<PostgresMetaResult<PostgresMaterializedView>>;
    retrieve({ name, schema, }: {
        name: string;
        schema: string;
    }): Promise<PostgresMetaResult<PostgresMaterializedView>>;
}
//# sourceMappingURL=PostgresMetaMaterializedViews.d.ts.map