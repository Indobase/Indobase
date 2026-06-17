import { createClient, } from "indobase-js";
import { VERSION } from "./version";
import { isBrowser } from "./utils";
import { createStorageFromOptions } from "./cookies";
let cachedBrowserClient;
export function createBrowserClient(projectUrl, apiKey, options) {
    // singleton client is created only if isSingleton is set to true, or if isSingleton is not defined and we detect a browser
    const shouldUseSingleton = options?.isSingleton === true ||
        ((!options || !("isSingleton" in options)) && isBrowser());
    if (shouldUseSingleton && cachedBrowserClient) {
        return cachedBrowserClient;
    }
    if (!projectUrl || !apiKey) {
        throw new Error(`@indobase/ssr: Your project's URL and API key are required to create a Supabase client!\n\nCheck your Supabase project's API settings to find these values\n\nhttps://indobase.in/dashboard/project/_/settings/api`);
    }
    const { storage } = createStorageFromOptions({
        ...options,
        cookieEncoding: options?.cookieEncoding ?? "base64url",
    }, false);
    const client = createClient(projectUrl, apiKey, {
        // TODO: resolve type error
        ...options,
        global: {
            ...options?.global,
            headers: {
                ...options?.global?.headers,
                "X-Client-Info": `supabase-ssr/${VERSION} createBrowserClient`,
            },
        },
        auth: {
            ...options?.auth,
            ...(options?.cookieOptions?.name
                ? { storageKey: options.cookieOptions.name }
                : null),
            flowType: "pkce",
            autoRefreshToken: isBrowser(),
            detectSessionInUrl: isBrowser(),
            persistSession: true,
            storage,
        },
    });
    if (shouldUseSingleton) {
        cachedBrowserClient = client;
    }
    return client;
}
//# sourceMappingURL=createBrowserClient.js.map