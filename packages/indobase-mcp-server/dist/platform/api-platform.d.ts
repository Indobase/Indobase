import { IndobasePlatform } from './index.js';
import '@indobaseinc/mcp-utils';
import 'zod/v4';

type IndobaseApiPlatformOptions = {
    /**
     * The access token for the Indobase Management API.
     */
    accessToken: string;
    /**
     * The API URL for the Indobase Management API.
     */
    apiUrl?: string;
};
/**
 * Creates a Indobase platform implementation using the Indobase Management API.
 */
declare function createIndobaseApiPlatform(options: IndobaseApiPlatformOptions): IndobasePlatform;

export { type IndobaseApiPlatformOptions, createIndobaseApiPlatform };
