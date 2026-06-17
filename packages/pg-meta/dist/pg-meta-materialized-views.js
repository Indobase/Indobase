import { z } from 'zod';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants';
import { coalesceRowsToArray, filterByList } from './helpers';
import { ident, literal } from './pg-format';
import { pgColumnArrayZod } from './pg-meta-columns';
import { COLUMNS_SQL } from './sql/columns';
import { MATERIALIZED_VIEWS_SQL } from './sql/materialized-views';
export const pgMaterializedViewZod = z.object({
    id: z.number(),
    schema: z.string(),
    name: z.string(),
    is_populated: z.boolean(),
    comment: z.string().nullable(),
    columns: pgColumnArrayZod.optional(),
});
export const pgMaterializedViewArrayZod = z.array(pgMaterializedViewZod);
export const pgMaterializedViewOptionalZod = z.optional(pgMaterializedViewZod);
export function list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, includeColumns = true, } = {}) {
    let sql = generateEnrichedMaterializedViewsSql({ includeColumns });
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
    return {
        sql,
        zod: pgMaterializedViewArrayZod,
    };
}
function getIdentifierWhereClause(identifier) {
    if ('id' in identifier && identifier.id) {
        return `${ident('id')} = ${literal(identifier.id)}`;
    }
    if ('name' in identifier && identifier.name && identifier.schema) {
        return `${ident('name')} = ${literal(identifier.name)} and ${ident('schema')} = ${literal(identifier.schema)}`;
    }
    throw new Error('Must provide either id or name and schema');
}
export function retrieve(identifier) {
    let whereClause = getIdentifierWhereClause(identifier);
    const sql = `${generateEnrichedMaterializedViewsSql({ includeColumns: true })} where ${whereClause};`;
    return {
        sql,
        zod: pgMaterializedViewOptionalZod,
    };
}
const generateEnrichedMaterializedViewsSql = ({ includeColumns }) => `
with materialized_views as (${MATERIALIZED_VIEWS_SQL})
  ${includeColumns ? `, columns as (${COLUMNS_SQL})` : ''}
select
  *
  ${includeColumns ? `, ${coalesceRowsToArray('columns', 'columns.table_id = materialized_views.id')}` : ''}
from materialized_views`;
export default {
    list,
    retrieve,
    zod: pgMaterializedViewZod,
};
