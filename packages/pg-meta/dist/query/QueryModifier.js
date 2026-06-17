import { countQuery, deleteQuery, insertQuery, selectQuery, truncateQuery, updateQuery, } from './Query.utils';
export class QueryModifier {
    constructor(table, action, options) {
        this.table = table;
        this.action = action;
        this.options = options;
    }
    /**
     * Limits the result to rows within the specified range, inclusive.
     *
     * @param from  The starting index from which to limit the result, inclusive.
     * @param to  The last index to which to limit the result, inclusive.
     */
    range(from, to) {
        this.pagination = { offset: from, limit: to - from + 1 };
        return this;
    }
    /**
     * Return SQL string for query chains
     */
    toSql(options = { isCTE: false, isFinal: true }) {
        try {
            const { actionValue, actionOptions, filters, sorts } = this.options ?? {};
            switch (this.action) {
                case 'count': {
                    return countQuery(this.table, { filters });
                }
                case 'delete': {
                    return deleteQuery(this.table, filters, {
                        returning: actionOptions?.returning,
                        enumArrayColumns: actionOptions?.enumArrayColumns,
                    });
                }
                case 'insert': {
                    return insertQuery(this.table, actionValue, {
                        returning: actionOptions?.returning,
                        enumArrayColumns: actionOptions?.enumArrayColumns,
                    });
                }
                case 'select': {
                    return selectQuery(this.table, actionValue, {
                        filters,
                        pagination: this.pagination,
                        sorts,
                    }, options.isFinal, options.isCTE);
                }
                case 'update': {
                    return updateQuery(this.table, actionValue, {
                        filters,
                        returning: actionOptions?.returning,
                        enumArrayColumns: actionOptions?.enumArrayColumns,
                    });
                }
                case 'truncate': {
                    return truncateQuery(this.table, {
                        cascade: actionOptions?.cascade,
                    });
                }
                default: {
                    return '';
                }
            }
        }
        catch (error) {
            throw error;
        }
    }
}
