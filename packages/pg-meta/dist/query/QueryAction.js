import { QueryFilter } from './QueryFilter';
export class QueryAction {
    constructor(table) {
        this.table = table;
    }
    /**
     * Performs a COUNT on the table.
     */
    count() {
        return new QueryFilter(this.table, 'count');
    }
    /**
     * Performs a DELETE on the table.
     *
     * @param options.returning  If `true`, return the deleted row(s) in the response.
     */
    delete(options) {
        return new QueryFilter(this.table, 'delete', undefined, options);
    }
    /**
     * Performs an INSERT into the table.
     *
     * @param values             The values to insert.
     * @param options.returning  If `true`, return the inserted row(s) in the response.
     */
    insert(values, options) {
        return new QueryFilter(this.table, 'insert', values, options);
    }
    /**
     * Performs vertical filtering with SELECT.
     *
     * @param columns the query columns, by default set to '*'.
     */
    select(columns) {
        return new QueryFilter(this.table, 'select', columns);
    }
    /**
     * Performs an UPDATE on the table.
     *
     * @param value  The value to update.
     * @param options.returning  If `true`, return the updated row(s) in the response.
     */
    update(value, options) {
        return new QueryFilter(this.table, 'update', value, options);
    }
    /**
     * Performs a TRUNCATE on the table
     */
    truncate(options) {
        return new QueryFilter(this.table, 'truncate', undefined, options);
    }
}
