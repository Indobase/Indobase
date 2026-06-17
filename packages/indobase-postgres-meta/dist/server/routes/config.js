import { PostgresMeta } from '../../lib/index.js';
import { DEFAULT_POOL_CONFIG } from '../constants.js';
import { extractRequestForLogging } from '../utils.js';
export default async (fastify) => {
    fastify.get('/', async (request, reply) => {
        const connectionString = request.headers.pg;
        const limit = request.query.limit;
        const offset = request.query.offset;
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.config.list({ limit, offset });
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(500);
            return { error: error.message };
        }
        return data;
    });
    fastify.get('/version', async (request, reply) => {
        const connectionString = request.headers.pg;
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.version.retrieve();
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(500);
            return { error: error.message };
        }
        return data;
    });
};
//# sourceMappingURL=config.js.map