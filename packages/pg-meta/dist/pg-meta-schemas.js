import { z } from 'zod';
import { DEFAULT_SYSTEM_SCHEMAS } from './constants';
import { ident, literal } from './pg-format';
import { SCHEMAS_SQL } from './sql/schemas';
const pgSchemaZod = z.object({
    id: z.number(),
    name: z.string(),
    owner: z.string(),
    comment: z.string().nullable(),
});
const pgSchemaArrayZod = z.array(pgSchemaZod);
const pgSchemaOptionalZod = z.optional(pgSchemaZod);
function list({ includeSystemSchemas = false, limit, offset, } = {}) {
    let sql = SCHEMAS_SQL;
    if (!includeSystemSchemas) {
        sql = `${sql} and not (n.nspname in (${DEFAULT_SYSTEM_SCHEMAS.map(literal).join(',')}))`;
    }
    if (limit) {
        sql = `${sql} limit ${limit}`;
    }
    if (offset) {
        sql = `${sql} offset ${offset}`;
    }
    return {
        sql,
        zod: pgSchemaArrayZod,
    };
}
function retrieve({ id, name }) {
    if (id) {
        const sql = `${SCHEMAS_SQL} and n.oid = ${literal(id)};`;
        return {
            sql,
            zod: pgSchemaOptionalZod,
        };
    }
    else {
        const sql = `${SCHEMAS_SQL} and n.nspname = ${literal(name)};`;
        return {
            sql,
            zod: pgSchemaOptionalZod,
        };
    }
}
function create({ name, owner }) {
    const sql = `create schema ${ident(name)}
  ${owner === undefined ? '' : `authorization ${ident(owner)}`};
`;
    return { sql };
}
function update({ id, name, }, { name: newName, owner }) {
    const sql = `
do $$
declare
  id oid := ${id === undefined ? `${literal(name)}::regnamespace` : literal(id)};
  old record;
  new_name text := ${newName === undefined ? null : literal(newName)};
  new_owner text := ${owner === undefined ? null : literal(owner)};
begin
  select * into old from pg_namespace where oid = id;
  if old is null then
    raise exception 'Cannot find schema with id %', id;
  end if;

  if new_owner is not null then
    execute(format('alter schema %I owner to %I;', old.nspname, new_owner));
  end if;

  -- Using the same name in the rename clause gives an error, so only do it if the new name is different.
  if new_name is not null and new_name != old.nspname then
    execute(format('alter schema %I rename to %I;', old.nspname, new_name));
  end if;
end
$$;
`;
    return { sql };
}
function remove({ id, name, }, { cascade = false } = {}) {
    const sql = `
do $$
declare
  id oid := ${id === undefined ? `${literal(name)}::regnamespace` : literal(id)};
  old record;
  cascade bool := ${literal(cascade)};
begin
  select * into old from pg_namespace where oid = id;
  if old is null then
    raise exception 'Cannot find schema with id %', id;
  end if;

  execute(format('drop schema %I %s;', old.nspname, case when cascade then 'cascade' else 'restrict' end));
end
$$;
`;
    return { sql };
}
export default {
    list,
    retrieve,
    create,
    update,
    remove,
    zod: pgSchemaZod,
};
