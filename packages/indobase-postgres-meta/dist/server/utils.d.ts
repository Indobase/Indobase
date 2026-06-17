import { FastifyRequest } from 'fastify';
export declare const extractRequestForLogging: (request: FastifyRequest) => {
    method: string;
    url: string;
    pg: string;
    opt: string;
};
export declare function translateErrorToResponseCode(error: {
    message: string;
}, defaultResponseCode?: number): number;
//# sourceMappingURL=utils.d.ts.map