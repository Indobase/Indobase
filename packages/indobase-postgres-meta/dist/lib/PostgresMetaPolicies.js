import { ident, literal } from 'pg-format';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants.js';
import { filterByList } from './helpers.js';
import { policiesSql } from './sql/index.js';
export default class PostgresMetaPolicies {
    query;
    constructor(query) {
        this.query = query;
    }
    async list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, } = {}) {
        let sql = policiesSql;
        const filter = filterByList(includedSchemas, excludedSchemas, !includeSystemSchemas ? DEFAULT_SYSTEM_SCHEMAS : undefined);
        if (filter) {
            sql += ` WHERE n.nspname ${filter}`;
        }
        if (limit) {
            sql = `${sql} LIMIT ${limit}`;
        }
        if (offset) {
            sql = `${sql} OFFSET ${offset}`;
        }
        return await this.query(sql);
    }
    async retrieve({ id, name, table, schema = 'public', }) {
        if (id) {
            const sql = `${policiesSql} WHERE pol.oid = ${literal(id)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data, error };
            }
            else if (data.length === 0) {
                return { data: null, error: { message: `Cannot find a policy with ID ${id}` } };
            }
            else {
                return { data: data[0], error };
            }
        }
        else if (name && table) {
            const sql = `${policiesSql} WHERE pol.polname = ${literal(name)} AND n.nspname = ${literal(schema)} AND c.relname = ${literal(table)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data, error };
            }
            else if (data.length === 0) {
                return {
                    data: null,
                    error: { message: `Cannot find a policy named ${name} for table ${schema}.${table}` },
                };
            }
            else {
                return { data: data[0], error };
            }
        }
        else {
            return { data: null, error: { message: 'Invalid parameters on policy retrieve' } };
        }
    }
    async create({ name, table, schema = 'public', definition, check, action = 'PERMISSIVE', command = 'ALL', roles = ['public'], }) {
        const definitionClause = definition === undefined ? '' : `USING (${definition})`;
        const checkClause = check === undefined ? '' : `WITH CHECK (${check})`;
        const sql = `
CREATE POLICY ${ident(name)} ON ${ident(schema)}.${ident(table)}
  AS ${action}
  FOR ${command}
  TO ${roles.map(ident).join(',')}
  ${definitionClause} ${checkClause};`;
        const { error } = await this.query(sql);
        if (error) {
            return { data: null, error };
        }
        return await this.retrieve({ name, table, schema });
    }
    async update(id, { name, definition, check, roles, }) {
        const { data: old, error } = await this.retrieve({ id });
        if (error) {
            return { data: null, error };
        }
        const alter = `ALTER POLICY ${ident(old.name)} ON ${ident(old.schema)}.${ident(old.table)}`;
        const nameSql = name === undefined ? '' : `${alter} RENAME TO ${ident(name)};`;
        const definitionSql = definition === undefined ? '' : `${alter} USING (${definition});`;
        const checkSql = check === undefined ? '' : `${alter} WITH CHECK (${check});`;
        const rolesSql = roles === undefined ? '' : `${alter} TO ${roles.map(ident).join(',')};`;
        // nameSql must be last
        const sql = `BEGIN; ${definitionSql} ${checkSql} ${rolesSql} ${nameSql} COMMIT;`;
        {
            const { error } = await this.query(sql);
            if (error) {
                return { data: null, error };
            }
        }
        return await this.retrieve({ id });
    }
    async remove(id) {
        const { data: policy, error } = await this.retrieve({ id });
        if (error) {
            return { data: null, error };
        }
        const sql = `DROP POLICY ${ident(policy.name)} ON ${ident(policy.schema)}.${ident(policy.table)};`;
        {
            const { error } = await this.query(sql);
            if (error) {
                return { data: null, error };
            }
        }
        return { data: policy, error: null };
    }
}
//# sourceMappingURL=PostgresMetaPolicies.js.map