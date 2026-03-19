# @indobase/ssr

Supabase-compatible SSR API for Indobase. This workspace package re-exports [@supabase/ssr](https://www.npmjs.com/package/@supabase/ssr) so existing code using `createBrowserClient`, `createServerClient`, `parseCookieHeader`, and `serializeCookieHeader` works unchanged.

- **Consumers:** Use `"@indobase/ssr": "workspace:*"` in this repo; they get this package, which in turn uses `@supabase/ssr`. The rest of the app uses [indobase-js](https://www.npmjs.com/package/indobase-js) for `createClient()`.
- **When upstream has the API:** If the npm package [@indobase/ssr](https://www.npmjs.com/package/@indobase/ssr) adds the same API (e.g. aliases + cookie adapter), you can switch back to `"@indobase/ssr": "^0.9.0"` and remove this package if desired.
