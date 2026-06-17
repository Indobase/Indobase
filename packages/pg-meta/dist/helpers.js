import { literal } from './pg-format';
export const coalesceRowsToArray = (source, filter) => {
    return `
COALESCE(
  (
    SELECT
      array_agg(row_to_json(${source})) FILTER (WHERE ${filter})
    FROM
      ${source}
  ),
  '{}'
) AS ${source}`;
};
export function filterByList(include, exclude, defaultExclude) {
    if (defaultExclude) {
        exclude = defaultExclude.concat(exclude ?? []);
    }
    if (include?.length) {
        return `IN (${include.map(literal).join(',')})`;
    }
    else if (exclude?.length) {
        return `NOT IN (${exclude.map(literal).join(',')})`;
    }
    return '';
}
export function exceptionIdentifierNotFound(entityName, whereClause) {
    return `raise exception 'Cannot find ${entityName} with: %', ${literal(whereClause)};`;
}
