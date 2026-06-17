import { z } from 'zod';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants';
import { filterByList } from './helpers';
import { ident, literal } from './pg-format';
import { POLICIES_SQL } from './sql/policies';
const pgPolicyZod = z.object({
    id: z.number(),
    schema: z.string(),
    table: z.string(),
    table_id: z.number(),
    name: z.string(),
    action: z.union([z.literal('PERMISSIVE'), z.literal('RESTRICTIVE')]),
    roles: z.array(z.string()),
    command: z.union([
        z.literal('SELECT'),
        z.literal('INSERT'),
        z.literal('UPDATE'),
        z.literal('DELETE'),
        z.literal('ALL'),
    ]),
    definition: z.union([z.string(), z.null()]),
    check: z.union([z.string(), z.null()]),
});
const pgPolicyArrayZod = z.array(pgPolicyZod);
const pgPolicyOptionalZod = z.optional(pgPolicyZod);
function getIdentifierWhereClause(identifier) {
    if ('id' in identifier && identifier.id) {
        return `id = ${literal(identifier.id)}`;
    }
    else if ('name' in identifier && identifier.name && identifier.schema && identifier.table) {
        return `name = ${literal(identifier.name)} AND schema = ${literal(identifier.schema)} AND table = ${literal(identifier.table)}`;
    }
    throw new Error('Must provide either id or name, schema and table');
}
function list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, } = {}) {
    let sql = `
    with policies as (${POLICIES_SQL})
    select *
    from policies
    `;
    const filter = filterByList(includedSchemas, excludedSchemas, !includeSystemSchemas ? DEFAULT_SYSTEM_SCHEMAS : undefined);
    if (filter) {
        sql += `where schema ${filter}`;
    }
    if (limit) {
        sql += ` limit ${limit}`;
    }
    if (offset) {
        sql += ` offset ${offset}`;
    }
    return {
        sql,
        zod: pgPolicyArrayZod,
    };
}
function retrieve(identifier) {
    const sql = `with policies as (${POLICIES_SQL}) select * from policies where ${getIdentifierWhereClause(identifier)};`;
    return {
        sql,
        zod: pgPolicyOptionalZod,
    };
}
function create({ name, schema = 'public', table, definition, check, action = 'PERMISSIVE', command = 'ALL', roles = ['public'], }) {
    const sql = `
create policy ${ident(name)} on ${ident(schema)}.${ident(table)}
  as ${action}
  for ${command}
  to ${roles.map(ident).join(',')}
  ${definition ? `using (${definition})` : ''}
  ${check ? `with check (${check})` : ''};`;
    return { sql };
}
function update(identifier, params) {
    const { name, definition, check, roles } = params;
    const alter = `ALTER POLICY ${ident(identifier.name)} ON ${ident(identifier.schema)}.${ident(identifier.table)}`;
    const nameSql = name === undefined ? '' : `${alter} RENAME TO ${ident(name)};`;
    const definitionSql = definition === undefined ? '' : `${alter} USING (${definition});`;
    const checkSql = check === undefined ? '' : `${alter} WITH CHECK (${check});`;
    const rolesSql = roles === undefined ? '' : `${alter} TO ${roles.map(ident).join(',')};`;
    // nameSql must be last
    const sql = `BEGIN; ${definitionSql} ${checkSql} ${rolesSql} ${nameSql} COMMIT;`;
    return { sql };
}
function remove(identifier) {
    const sql = `DROP POLICY ${ident(identifier.name)} ON ${ident(identifier.schema)}.${ident(identifier.table)};`;
    return { sql };
}
export default {
    list,
    retrieve,
    create,
    update,
    remove,
    zod: pgPolicyZod,
};
