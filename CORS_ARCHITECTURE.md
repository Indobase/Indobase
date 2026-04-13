# Indobase Architecture: API Gateway (Kong) CORS Policies

This document explains the architecture decisions behind Indobase's Kong declarative configuration (`kong.yml`) and how CORS, Preflight, and Authentication interact.

## The Wildcard + Credentials Problem

In early versions of the Indobase architecture, `kong.yml` specified the following CORS configuration for REST, Realtime, Storage, and GraphQL proxy paths:

```yaml
config:
  origins:
    - "*"
  methods:
    - GET
    - POST
    - PUT
    - PATCH
    - DELETE
    - OPTIONS
  credentials: true
```

### Why this is problematic
Modern web browsers follow rigid CORS standard implementations designed to prevent malicious cross-site credential exploitation. The specification states that a server cannot use a wildcard `*` for the `Access-Control-Allow-Origin` (ACAO) header if `Access-Control-Allow-Credentials` is set to `true`. 

When both are sent on a preflight `OPTIONS` request, the browser's security layer immediately drops the connection and reports a "CORS Error".

## Misleading CORS Errors on 401s

Kong handles traffic linearly via a series of plugins running in priority order. For secure Indobase API endpoints, two main plugins govern early-stage traffic:
1. **CORS** 
2. **Key-Auth**

When a frontend sends an invalid or missing `$SUPABASE_ANON_KEY`, the `key-auth` plugin terminates the request with a `401 Unauthorized` before processing it downstream. 

If the Kong gateway uses `credentials: true` alongside `origins: *`, the browser enforces strict CORS credential policies on that 401 response and blocks the developer from seeing the true `401` status code. Instead, the console prints a misleading generic "CORS Missing Allow Origin" error. 

**This historically forced developers into building workaround proxy servers (e.g. Vite Server Proxy) just to test frontend integrations.**

## The Architectural Solution

To resolve this permanently in a local, db-less (declarative) Kong configuration, Indobase has updated `kong.yml` to universally enforce:

```yaml
config:
  origins:
    - "*"
  methods: ...
  credentials: false
```

### Why `credentials: false` fixes everything

1. **Perfect Wildcard Access**: By removing `credentials: true`, an `Access-Control-Allow-Origin: *` is 100% valid. This instantly allows any frontend (e.g. `localhost:3000`, `localhost:5173`, `yourdomain.com`) to query the Indobase API without requiring backend reconfiguration or redeployment.
2. **Transparent Error Logging**: Because the browser accepts the wildcard origin, any failure (like a 401 from an invalid Anon Key) is correctly tracked and exposed in the Network tab, significantly improving developer experience.
3. **Token Based Auth**: Indobase/Supabase primarily relies on Bearer Tokens (`Authorization: Bearer <token>`) to establish session identity on the API gateway, eliminating the strict requirement for cross-origin tracking cookies (`credentials: true`), making this the most robust zero-config default configuration.

## Managing Custom Origins

If a production environment eventually requires locked-down CORS policies, administrators must deploy specific allowed origins instead of wildcards:

```yaml
config:
  origins:
    - "https://yourfrontend.com"
    - "https://staging.yourfrontend.com"
  credentials: true
```
*Note: Because Kong runs in `db-less` mode locally using `kong.yml`, custom origins cannot be injected "dynamically" via a dashboard UI without restarting the Kong Docker container to load the new declarative schema.*
