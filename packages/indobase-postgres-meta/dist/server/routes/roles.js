import { PostgresMeta } from '../../lib/index.js';
import { DEFAULT_POOL_CONFIG } from '../constants.js';
import { extractRequestForLogging } from '../utils.js';
import { postgresRoleSchema, postgresRoleCreateSchema, postgresRoleUpdateSchema, } from '../../lib/types.js';
import { Type } from '@sinclair/typebox';
export default async (fastify) => {
    fastify.get('/', {
        schema: {
            headers: Type.Object({
                pg: Type.String(),
            }),
            querystring: Type.Object({
                include_system_schemas: Type.Optional(Type.String()),
                limit: Type.Optional(Type.String()),
                offset: Type.Optional(Type.String()),
            }),
            response: {
                200: Type.Array(postgresRoleSchema),
                500: Type.Object({
                    error: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const connectionString = request.headers.pg;
        const includeDefaultRoles = request.query.include_default_roles === 'true';
        const limit = request.query.limit;
        const offset = request.query.offset;
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.roles.list({
            includeDefaultRoles,
            limit,
            offset,
        });
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(500);
            return { error: error.message };
        }
        return data;
    });
    fastify.get('/:id(\\d+)', {
        schema: {
            headers: Type.Object({
                pg: Type.String(),
            }),
            params: Type.Object({
                id: Type.RegEx(/\d+/),
            }),
            response: {
                200: postgresRoleSchema,
                404: Type.Object({
                    error: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const connectionString = request.headers.pg;
        const id = Number(request.params.id);
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.roles.retrieve({ id });
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(404);
            return { error: error.message };
        }
        return data;
    });
    fastify.post('/', {
        schema: {
            headers: Type.Object({
                pg: Type.String(),
            }),
            body: postgresRoleCreateSchema,
            response: {
                200: postgresRoleSchema,
                400: Type.Object({
                    error: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const connectionString = request.headers.pg;
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.roles.create(request.body);
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(400);
            return { error: error.message };
        }
        return data;
    });
    fastify.patch('/:id(\\d+)', {
        schema: {
            headers: Type.Object({
                pg: Type.String(),
            }),
            params: Type.Object({
                id: Type.RegEx(/\d+/),
            }),
            body: postgresRoleUpdateSchema,
            response: {
                200: postgresRoleSchema,
                400: Type.Object({
                    error: Type.String(),
                }),
                404: Type.Object({
                    error: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const connectionString = request.headers.pg;
        const id = Number(request.params.id);
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.roles.update(id, request.body);
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(400);
            if (error.message.startsWith('Cannot find'))
                reply.code(404);
            return { error: error.message };
        }
        return data;
    });
    fastify.delete('/:id(\\d+)', {
        schema: {
            headers: Type.Object({
                pg: Type.String(),
            }),
            params: Type.Object({
                id: Type.RegEx(/\d+/),
            }),
            querystring: Type.Object({
                cascade: Type.Optional(Type.String()),
            }),
            response: {
                200: postgresRoleSchema,
                400: Type.Object({
                    error: Type.String(),
                }),
                404: Type.Object({
                    error: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const connectionString = request.headers.pg;
        const id = Number(request.params.id);
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.roles.remove(id);
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(400);
            if (error.message.startsWith('Cannot find'))
                reply.code(404);
            return { error: error.message };
        }
        return data;
    });
};
//# sourceMappingURL=roles.js.map