import { z } from 'zod';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants';
import { coalesceRowsToArray, filterByList } from './helpers';
import { ident, literal } from './pg-format';
import { pgColumnArrayZod } from './pg-meta-columns';
import { COLUMNS_SQL } from './sql/columns';
import { VIEWS_SQL } from './sql/views';
export const pgViewZod = z.object({
    id: z.number(),
    schema: z.string(),
    name: z.string(),
    is_updatable: z.boolean(),
    comment: z.string().nullable(),
    columns: pgColumnArrayZod.optional(),
});
export const pgViewArrayZod = z.array(pgViewZod);
export const pgViewOptionalZod = z.optional(pgViewZod);
export function list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, includeColumns = true, } = {}) {
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
    return {
        sql,
        zod: pgViewArrayZod,
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
    const sql = `${generateEnrichedViewsSql({ includeColumns: true })} where ${whereClause};`;
    return {
        sql,
        zod: pgViewOptionalZod,
    };
}
const generateEnrichedViewsSql = ({ includeColumns }) => `
with views as (${VIEWS_SQL})
  ${includeColumns ? `, columns as (${COLUMNS_SQL})` : ''}
select
  *
  ${includeColumns ? `, ${coalesceRowsToArray('columns', 'columns.table_id = views.id')}` : ''}
from views`;
export default {
    list,
    retrieve,
    zod: pgViewZod,
};
