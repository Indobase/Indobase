import { literal } from 'pg-format';
import { coalesceRowsToArray, filterByList } from './helpers.js';
import { columnsSql, materializedViewsSql } from './sql/index.js';
export default class PostgresMetaMaterializedViews {
    query;
    constructor(query) {
        this.query = query;
    }
    async list({ includedSchemas, excludedSchemas, limit, offset, includeColumns = false, } = {}) {
        let sql = generateEnrichedMaterializedViewsSql({ includeColumns });
        const filter = filterByList(includedSchemas, excludedSchemas, undefined);
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
            const sql = `${generateEnrichedMaterializedViewsSql({
                includeColumns: true,
            })} where materialized_views.id = ${literal(id)};`;
            console.log(sql);
            const { data, error } = await this.query(sql);
            if (error) {
                return { data, error };
            }
            else if (data.length === 0) {
                return { data: null, error: { message: `Cannot find a materialized view with ID ${id}` } };
            }
            else {
                return { data: data[0], error };
            }
        }
        else if (name) {
            const sql = `${generateEnrichedMaterializedViewsSql({
                includeColumns: true,
            })} where materialized_views.name = ${literal(name)} and materialized_views.schema = ${literal(schema)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data, error };
            }
            else if (data.length === 0) {
                return {
                    data: null,
                    error: { message: `Cannot find a materialized view named ${name} in schema ${schema}` },
                };
            }
            else {
                return { data: data[0], error };
            }
        }
        else {
            return { data: null, error: { message: 'Invalid parameters on materialized view retrieve' } };
        }
    }
}
const generateEnrichedMaterializedViewsSql = ({ includeColumns }) => `
with materialized_views as (${materializedViewsSql})
  ${includeColumns ? `, columns as (${columnsSql})` : ''}
select
  *
  ${includeColumns
    ? `, ${coalesceRowsToArray('columns', 'columns.table_id = materialized_views.id')}`
    : ''}
from materialized_views`;
//# sourceMappingURL=PostgresMetaMaterializedViews.js.map