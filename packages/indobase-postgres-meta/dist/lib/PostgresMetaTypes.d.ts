import { PostgresMetaResult, PostgresType } from './types.js';
export default class PostgresMetaTypes {
    query: (sql: string) => Promise<PostgresMetaResult<any>>;
    constructor(query: (sql: string) => Promise<PostgresMetaResult<any>>);
    list({ includeArrayTypes, includeSystemSchemas, includedSchemas, excludedSchemas, limit, offset, }?: {
        includeArrayTypes?: boolean;
        includeSystemSchemas?: boolean;
        includedSchemas?: string[];
        excludedSchemas?: string[];
        limit?: number;
        offset?: number;
    }): Promise<PostgresMetaResult<PostgresType[]>>;
}
//# sourceMappingURL=PostgresMetaTypes.d.ts.map