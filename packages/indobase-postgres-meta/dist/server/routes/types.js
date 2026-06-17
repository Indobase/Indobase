import { PostgresMeta } from '../../lib/index.js';
import { DEFAULT_POOL_CONFIG } from '../constants.js';
import { extractRequestForLogging } from '../utils.js';
export default async (fastify) => {
    fastify.get('/', async (request, reply) => {
        const connectionString = request.headers.pg;
        const includeArrayTypes = request.query.include_array_types === 'true';
        const includeSystemSchemas = request.query.include_system_schemas === 'true';
        const includedSchemas = request.query.included_schemas?.split(',');
        const excludedSchemas = request.query.excluded_schemas?.split(',');
        const limit = request.query.limit;
        const offset = request.query.offset;
        const pgMeta = new PostgresMeta({ ...DEFAULT_POOL_CONFIG, connectionString });
        const { data, error } = await pgMeta.types.list({
            includeArrayTypes,
            includeSystemSchemas,
            includedSchemas,
            excludedSchemas,
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
};
//# sourceMappingURL=types.js.map