import { z } from 'zod';
export declare const pgVersionZod: z.ZodObject<{
    version: z.ZodString;
    version_number: z.ZodNumber;
    active_connections: z.ZodNumber;
    max_connections: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: string;
    version_number: number;
    active_connections: number;
    max_connections: number;
}, {
    version: string;
    version_number: number;
    active_connections: number;
    max_connections: number;
}>;
declare function retrieve(): {
    sql: string;
    zod: z.ZodObject<{
        version: z.ZodString;
        version_number: z.ZodNumber;
        active_connections: z.ZodNumber;
        max_connections: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        version: string;
        version_number: number;
        active_connections: number;
        max_connections: number;
    }, {
        version: string;
        version_number: number;
        active_connections: number;
        max_connections: number;
    }>;
};
declare const _default: {
    retrieve: typeof retrieve;
    zod: z.ZodObject<{
        version: z.ZodString;
        version_number: z.ZodNumber;
        active_connections: z.ZodNumber;
        max_connections: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        version: string;
        version_number: number;
        active_connections: number;
        max_connections: number;
    }, {
        version: string;
        version_number: number;
        active_connections: number;
        max_connections: number;
    }>;
};
export default _default;
//# sourceMappingURL=pg-meta-version.d.ts.map