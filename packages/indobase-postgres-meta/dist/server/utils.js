import pgcs from 'pg-connection-string';
export const extractRequestForLogging = (request) => {
    let pg = 'unknown';
    try {
        if (request.headers.pg) {
            pg = pgcs.parse(request.headers.pg).host || pg;
        }
    }
    catch (e) {
        console.warn('failed to parse PG connstring for ' + request.url);
    }
    const additional = request.headers['x-indobase-info']?.toString() || '';
    return {
        method: request.method,
        url: request.url,
        pg,
        opt: additional,
    };
};
export function translateErrorToResponseCode(error, defaultResponseCode = 400) {
    if (error.message === 'Connection terminated due to connection timeout') {
        return 504;
    }
    else if (error.message === 'sorry, too many clients already') {
        return 503;
    }
    return defaultResponseCode;
}
//# sourceMappingURL=utils.js.map