import { z } from 'zod';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants';
import { coalesceRowsToArray, filterByList } from './helpers';
import { ident, literal } from './pg-format';
import { pgColumnArrayZod } from './pg-meta-columns';
import { COLUMNS_SQL } from './sql/columns';
import { FOREIGN_TABLES_SQL } from './sql/foreign-tables';
export const pgForeignTableZod = z.object({
    id: z.number(),
    schema: z.string(),
    name: z.string(),
    comment: z.string().nullable(),
    foreign_server_name: z.string(),
    foreign_data_wrapper_name: z.string(),
    foreign_data_wrapper_handler: z.string(),
    columns: pgColumnArrayZod.optional(),
});
export const pgForeignTableArrayZod = z.array(pgForeignTableZod);
export const pgForeignTableOptionalZod = z.optional(pgForeignTableZod);
export function list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, includeColumns = true, } = {}) {
    let sql = generateEnrichedForeignTablesSql({ includeColumns });
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
        zod: pgForeignTableArrayZod,
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
    const sql = `${generateEnrichedForeignTablesSql({ includeColumns: true })} where ${getIdentifierWhereClause(identifier)};`;
    return {
        sql,
        zod: pgForeignTableOptionalZod,
    };
}
const generateEnrichedForeignTablesSql = ({ includeColumns }) => `
with foreign_tables as (${FOREIGN_TABLES_SQL})
  ${includeColumns ? `, columns as (${COLUMNS_SQL})` : ''}
select
  *
  ${includeColumns ? `, ${coalesceRowsToArray('columns', 'columns.table_id = foreign_tables.id')}` : ''}
from foreign_tables`;
export default {
    list,
    retrieve,
    zod: pgForeignTableZod,
};
