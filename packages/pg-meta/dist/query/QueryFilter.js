import { QueryModifier } from './QueryModifier';
export class QueryFilter {
    constructor(table, action, actionValue, actionOptions) {
        this.table = table;
        this.action = action;
        this.actionValue = actionValue;
        this.actionOptions = actionOptions;
        this.filters = [];
        this.sorts = [];
    }
    filter(column, operator, value) {
        this.filters.push({ column, operator, value });
        return this;
    }
    match(criteria) {
        Object.entries(criteria).map(([column, value]) => {
            this.filters.push({ column, operator: '=', value });
        });
        return this;
    }
    order(table, column, ascending = true, nullsFirst = false) {
        this.sorts.push({
            table: table,
            column: column,
            ascending,
            nullsFirst,
        });
        return this;
    }
    range(from, to) {
        return this._getQueryModifier().range(from, to);
    }
    clone() {
        const clonedData = structuredClone({
            table: this.table,
            action: this.action,
            actionValue: this.actionValue,
            actionOptions: this.actionOptions,
            filters: this.filters,
            sorts: this.sorts,
        });
        const cloned = new QueryFilter(clonedData.table, clonedData.action, clonedData.actionValue, clonedData.actionOptions);
        cloned.filters = clonedData.filters;
        cloned.sorts = clonedData.sorts;
        return cloned;
    }
    toSql(options) {
        return this._getQueryModifier().toSql(options);
    }
    _getQueryModifier() {
        return new QueryModifier(this.table, this.action, {
            actionValue: this.actionValue,
            actionOptions: this.actionOptions,
            filters: this.filters,
            sorts: this.sorts,
        });
    }
}
