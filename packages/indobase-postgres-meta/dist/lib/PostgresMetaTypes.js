import { DEFAULT_SYSTEM_SCHEMAS } from './constants.js';
import { filterByList } from './helpers.js';
import { typesSql } from './sql/index.js';
export default class PostgresMetaTypes {
    query;
    constructor(query) {
        this.query = query;
    }
    async list({ includeArrayTypes = false, includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, } = {}) {
        let sql = typesSql;
        if (!includeArrayTypes) {
            sql += ` and not exists (
                 select
                 from
                   pg_type el
                 where
                   el.oid = t.typelem
                   and el.typarray = t.oid
               )`;
        }
        const filter = filterByList(includedSchemas, excludedSchemas, !includeSystemSchemas ? DEFAULT_SYSTEM_SCHEMAS : undefined);
        if (filter) {
            sql += ` and n.nspname ${filter}`;
        }
        if (limit) {
            sql += ` limit ${limit}`;
        }
        if (offset) {
            sql += ` offset ${offset}`;
        }
        return await this.query(sql);
    }
}
//# sourceMappingURL=PostgresMetaTypes.js.map