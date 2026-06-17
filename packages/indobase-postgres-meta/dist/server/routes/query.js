import { PostgresMeta } from '../../lib/index.js';
import * as Parser from '../../lib/Parser.js';
import { DEFAULT_POOL_CONFIG } from '../constants.js';
import { extractRequestForLogging, translateErrorToResponseCode } from '../utils.js';
const errorOnEmptyQuery = (request) => {
    if (!request.body.query) {
        throw new Error('query not found');
    }
};
export default async (fastify) => {
    fastify.post('/', async (request, reply) => {
        errorOnEmptyQuery(request);
        const connectionString = request.headers.pg;
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.query(request.body.query);
        await pgMeta.end();
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(translateErrorToResponseCode(error));
            return { error: error.message };
        }
        return data || [];
    });
    fastify.post('/format', async (request, reply) => {
        errorOnEmptyQuery(request);
        const { data, error } = Parser.Format(request.body.query);
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(translateErrorToResponseCode(error));
            return { error: error.message };
        }
        return data;
    });
    fastify.post('/parse', async (request, reply) => {
        errorOnEmptyQuery(request);
        const { data, error } = Parser.Parse(request.body.query);
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(translateErrorToResponseCode(error));
            return { error: error.message };
        }
        return data;
    });
    fastify.post('/deparse', async (request, reply) => {
        const { data, error } = Parser.Deparse(request.body.ast);
        if (error) {
            request.log.error({ error, request: extractRequestForLogging(request) });
            reply.code(translateErrorToResponseCode(error));
            return { error: error.message };
        }
        return data;
    });
};
//# sourceMappingURL=query.js.map