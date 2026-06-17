import { QueryAction } from './QueryAction';
export class Query {
    /**
     * @param name    the table name.
     * @param schema  the table schema, by default set to 'public'.
     */
    from(name, schema) {
        return new QueryAction({
            name,
            schema: schema ?? 'public',
        });
    }
}
