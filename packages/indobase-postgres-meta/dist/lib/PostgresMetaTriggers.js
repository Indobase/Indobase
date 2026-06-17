import { ident, literal } from 'pg-format';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants.js';
import { filterByList } from './helpers.js';
import { triggersSql } from './sql/index.js';
export default class PostgresMetaTriggers {
    query;
    constructor(query) {
        this.query = query;
    }
    async list({ includeSystemSchemas = false, includedSchemas, excludedSchemas, limit, offset, } = {}) {
        let sql = enrichedTriggersSql;
        const filter = filterByList(includedSchemas, excludedSchemas, !includeSystemSchemas ? DEFAULT_SYSTEM_SCHEMAS : undefined);
        if (filter) {
            sql += ` WHERE schema ${filter}`;
        }
        if (limit) {
            sql = `${sql} LIMIT ${limit}`;
        }
        if (offset) {
            sql = `${sql} OFFSET ${offset}`;
        }
        return await this.query(sql);
    }
    async retrieve({ id, name, schema = 'public', table, }) {
        if (id) {
            const sql = `${enrichedTriggersSql} WHERE id = ${literal(id)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data: null, error };
            }
            const triggerRecord = data && data[0];
            if (triggerRecord) {
                return { data: triggerRecord, error: null };
            }
            return { data: null, error: { message: `Cannot find a trigger with ID ${id}` } };
        }
        if (name && schema && table) {
            const sql = `${enrichedTriggersSql} WHERE name = ${literal(name)} AND schema = ${literal(schema)} AND triggers.table = ${literal(table)};`;
            const { data, error } = await this.query(sql);
            if (error) {
                return { data: null, error };
            }
            const triggerRecord = data && data[0];
            if (triggerRecord) {
                return { data: triggerRecord, error: null };
            }
            return {
                data: null,
                error: {
                    message: `Cannot find a trigger with name ${name} on table "${schema}"."${table}"`,
                },
            };
        }
        return { data: null, error: { message: 'Invalid parameters on trigger retrieve' } };
    }
    /**
     * Creates trigger
     *
     * @param {Object} obj - An object.
     * @param {string} obj.name - Trigger name.
     * @param {string} obj.schema - Name of schema that trigger is for.
     * @param {string} obj.table - Unqualified table, view, or foreign table name that trigger is for.
     * @param {string} obj.function_schema - Name of schema that function is for.
     * @param {string} obj.function_name - Unqualified name of the function to execute.
     * @param {('BEFORE'|'AFTER'|'INSTEAD OF')} obj.activation - Determines when function is called
     * during event occurrence.
     * @param {Array<string>} obj.events - Event(s) that will fire the trigger. Array of the following options: 'INSERT' | 'UPDATE' | 'UPDATE
     * OF column_name1,column_name2' | 'DELETE' | 'TRUNCATE'.
     * @param {('ROW'|'STATEMENT')} obj.orientation - Trigger function for every row affected by event or
     * once per statement. Defaults to 'STATEMENT'.
     * @param {string} obj.condition - Boolean expression that will trigger function.
     * For example: 'old.* IS DISTINCT FROM new.*'
     * @param {Array<string>} obj.function_args - array of arguments to be passed to function when trigger is fired.
     * For example: ['arg1', 'arg2']
     */
    async create({ name, schema = 'public', table, function_schema = 'public', function_name, function_args, activation, events, orientation, condition, }) {
        const qualifiedTableName = `${ident(schema)}.${ident(table)}`;
        const qualifiedFunctionName = `${ident(function_schema)}.${ident(function_name)}`;
        const triggerEvents = events.join(' OR ');
        const triggerOrientation = orientation ? `FOR EACH ${orientation}` : '';
        const triggerCondition = condition ? `WHEN (${condition})` : '';
        const functionArgs = `${function_args?.map(literal).join(',') ?? ''}`;
        const sql = `CREATE TRIGGER ${ident(name)} ${activation} ${triggerEvents} ON ${qualifiedTableName} ${triggerOrientation} ${triggerCondition} EXECUTE FUNCTION ${qualifiedFunctionName}(${functionArgs});`;
        const { error } = await this.query(sql);
        if (error) {
            return { data: null, error };
        }
        return await this.retrieve({
            name,
            table,
            schema,
        });
    }
    async update(id, { name, enabled_mode, }) {
        const { data: old, error } = await this.retrieve({ id });
        if (error) {
            return { data: null, error };
        }
        let enabledModeSql = '';
        switch (enabled_mode) {
            case 'ORIGIN':
                enabledModeSql = `ALTER TABLE ${ident(old.schema)}.${ident(old.table)} ENABLE TRIGGER ${ident(old.name)};`;
                break;
            case 'DISABLED':
                enabledModeSql = `ALTER TABLE ${ident(old.schema)}.${ident(old.table)} DISABLE TRIGGER ${ident(old.name)};`;
                break;
            case 'REPLICA':
            case 'ALWAYS':
                enabledModeSql = `ALTER TABLE ${ident(old.schema)}.${ident(old.table)} ENABLE ${enabled_mode} TRIGGER ${ident(old.name)};`;
                break;
            default:
                break;
        }
        const nameSql = name && name !== old.name
            ? `ALTER TRIGGER ${ident(old.name)} ON ${ident(old.schema)}.${ident(old.table)} RENAME TO ${ident(name)};`
            : '';
        // updateNameSql must be last
        const sql = `BEGIN; ${enabledModeSql}; ${nameSql}; COMMIT;`;
        {
            const { error } = await this.query(sql);
            if (error) {
                return { data: null, error };
            }
        }
        return await this.retrieve({ id });
    }
    async remove(id, { cascade = false } = {}) {
        const { data: triggerRecord, error } = await this.retrieve({ id });
        if (error) {
            return { data: null, error };
        }
        const { name, schema, table } = triggerRecord;
        const sql = `DROP TRIGGER ${ident(name)} ON ${ident(schema)}.${ident(table)} ${cascade ? 'CASCADE' : ''};`;
        {
            const { error } = await this.query(sql);
            if (error) {
                return { data: null, error };
            }
        }
        return { data: triggerRecord, error: null };
    }
}
const enrichedTriggersSql = `
  WITH triggers AS (
    ${triggersSql}
  )
  SELECT
    *
  FROM triggers
`;
//# sourceMappingURL=PostgresMetaTriggers.js.map