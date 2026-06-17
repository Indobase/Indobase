import { literal } from 'pg-format';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants.js';
import { coalesceRowsToArray, filterByList } from './helpers.js';
import { columnsSql, viewsSql } from './sql/index.js';
export default class PostgresMetaViews {
    query;
    constructor(query) {
        this.query = query;
    }
    async list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, includeColumns = true, } = {}) {
        let sql = generateEnrichedViewsSql({ includeColumns });
        const filter = filterByList(includedSchemas, excludedSchemas, !includeSystemSchemas ? DEFAULT_SYSTEM_SCHEMAS : undefined);
        if (filter) {
            sql += ` where schema ${filter}`;
        }
        if (limit) {
            sql += ` limit ${limit}`;
        }
        if (offset) {
            sql += ` offset ${offset}`;
        }
        return await this.query(sql);
    }
    async retrieve({ id, name, schema = 'public', }) {
        if (id) {
            const sql = `${generateEnrichedViewsSql({
                includeColumns: true,
            })} where views.id = ${literal(id)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data, error };
            }
            else if (data.length === 0) {
                return { data: null, error: { message: `Cannot find a view with ID ${id}` } };
            }
            else {
                return { data: data[0], error };
            }
        }
        else if (name) {
            const sql = `${generateEnrichedViewsSql({
                includeColumns: true,
            })} where views.name = ${literal(name)} and views.schema = ${literal(schema)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data, error };
            }
            else if (data.length === 0) {
                return {
                    data: null,
                    error: { message: `Cannot find a view named ${name} in schema ${schema}` },
                };
            }
            else {
                return { data: data[0], error };
            }
        }
        else {
            return { data: null, error: { message: 'Invalid parameters on view retrieve' } };
        }
    }
}
const generateEnrichedViewsSql = ({ includeColumns }) => `
with views as (${viewsSql})
  ${includeColumns ? `, columns as (${columnsSql})` : ''}
select
  *
  ${includeColumns ? `, ${coalesceRowsToArray('columns', 'columns.table_id = views.id')}` : ''}
from views`;
//# sourceMappingURL=PostgresMetaViews.js.map