import { PoolConfig } from 'pg';
import { PostgresMetaResult } from './types.js';
export declare const init: (config: PoolConfig) => {
    query: (sql: string) => Promise<PostgresMetaResult<any>>;
    end: () => Promise<void>;
};
//# sourceMappingURL=db.d.ts.map