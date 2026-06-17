import { configSql } from './sql/index.js';
export default class PostgresMetaConfig {
    query;
    constructor(query) {
        this.query = query;
    }
    async list({ limit, offset, } = {}) {
        let sql = configSql;
        if (limit) {
            sql = `${sql} LIMIT ${limit}`;
        }
        if (offset) {
            sql = `${sql} OFFSET ${offset}`;
        }
        return await this.query(sql);
    }
}
//# sourceMappingURL=PostgresMetaConfig.js.map