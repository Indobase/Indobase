/**
 * Renders per-project isolated data-plane stack + Traefik routing config.
 *
 * Goal (Option A): each project gets its own DB + services, and traffic to
 *   https://<project-ref>.<PUBLIC_DOMAIN>/{rest|auth|storage|realtime|functions}/v1/*
 * is routed to that project's stack.
 *
 * This script is intentionally "dumb": it does not talk to the control-plane DB.
 * You pass the required values (ref, ports, keys, DSN) via env.
 *
 * Usage:
 *   PROJECT_REF=p-abc PUBLIC_DOMAIN=indobase.in DATA_PLANE_PORT_BASE=20100 \
 *   TENANT_DB_URL=postgres://... ANON_KEY=... SERVICE_ROLE_KEY=... JWT_SECRET=... \
 *   node docker/tenants/render-tenant-stack.mjs
 *
 * Outputs:
 *   docker/tenants/<ref>/docker-compose.yml
 *   docker/tenants/<ref>/traefik.yml
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'

function mustEnv(name) {
  const v = process.env[name]
  if (!v || String(v).trim() === '') {
    console.error(`${name} is required`)
    process.exit(1)
  }
  return String(v).trim()
}

const projectRef = mustEnv('PROJECT_REF')
const publicDomain = mustEnv('PUBLIC_DOMAIN')
const base = Number(mustEnv('DATA_PLANE_PORT_BASE'))
const tenantDbUrl = mustEnv('TENANT_DB_URL')
const anonKey = mustEnv('ANON_KEY')
const serviceKey = mustEnv('SERVICE_ROLE_KEY')
const jwtSecret = mustEnv('JWT_SECRET')

if (!Number.isFinite(base) || base < 1024) {
  console.error('DATA_PLANE_PORT_BASE must be a number >= 1024')
  process.exit(1)
}

// Port convention: base + 1..N (leave gaps for future expansion).
const ports = {
  rest: base + 1,
  auth: base + 2,
  storage: base + 3,
  realtime: base + 4,
  functions: base + 5,
  site: base + 7,
}

function parseEnvInt(name, fallback) {
  const raw = process.env[name]
  if (!raw || String(raw).trim() === '') return fallback
  const n = parseInt(String(raw).trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Non-negative int; empty env → fallback (used for PGRST_DB_MAX_ROWS where 0 is valid). */
function parseEnvNonNegInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || String(raw).trim() === '') return fallback
  const n = parseInt(String(raw).trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const storageFileLimit = parseEnvInt('SAAS_TENANT_STORAGE_FILE_SIZE_LIMIT_BYTES', 5368709120)
const rtNofile = parseEnvInt('SAAS_TENANT_REALTIME_RLIMIT_NOFILE', 50000)
const rtDbPool = parseEnvInt('SAAS_TENANT_REALTIME_DB_POOL_SIZE', 24)
const edgeMem = (process.env.SAAS_TENANT_EDGE_RUNTIME_MEM_LIMIT || '512m').trim()
const pgrstMemRaw = (process.env.SAAS_TENANT_POSTGREST_MEM_LIMIT || '512m').trim()
const pgrstMem = /^\d+([mMgG])$/.test(pgrstMemRaw) ? pgrstMemRaw : '512m'
const pgrstPool = parseEnvInt('SAAS_TENANT_POSTGREST_DB_POOL', 40)
const pgrstPoolAcquire = parseEnvInt('SAAS_TENANT_POSTGREST_POOL_ACQUISITION_TIMEOUT', 15)
const pgrstPoolIdle = parseEnvInt('SAAS_TENANT_POSTGREST_POOL_MAX_IDLETIME', 120)

/** Docker DNS names only resolvable on the control-plane compose network. */
const DOCKER_ONLY_MAIL_HOSTS = new Set([
  'indobase-mail',
  'indobase-smtp-relay',
  'supabase-mail',
  'mail',
])

function resolveTenantSmtpHost() {
  const explicit = (process.env.SAAS_TENANT_SMTP_HOST || '').trim()
  if (explicit) return explicit
  const smtp = (process.env.SMTP_HOST || '').trim()
  if (smtp && !DOCKER_ONLY_MAIL_HOSTS.has(smtp.toLowerCase())) return smtp
  const controlPlane = (
    process.env.SAAS_CONTROL_PLANE_HOST ||
    process.env.SAAS_SMTP_PUBLIC_HOST ||
    ''
  ).trim()
  if (controlPlane) return controlPlane
  return smtp || 'indobase-mail'
}

function resolveTenantSmtpPort(smtpHost) {
  const explicit = (
    process.env.SAAS_TENANT_SMTP_PORT ||
    process.env.SMTP_PORT ||
    ''
  ).trim()
  if (explicit) return explicit
  return DOCKER_ONLY_MAIL_HOSTS.has(smtpHost.toLowerCase()) ? '2500' : '587'
}

function resolveTenantMailerTemplatesBase() {
  const explicit = (process.env.SAAS_TENANT_MAILER_TEMPLATES_BASE || '').trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const controlPlane = (
    process.env.SAAS_CONTROL_PLANE_HOST ||
    process.env.SAAS_SMTP_PUBLIC_HOST ||
    ''
  ).trim()
  const port = (process.env.TEMPLATES_SERVER_PUBLISH_PORT || '8095').trim()
  if (controlPlane) return `http://${controlPlane}:${port}`
  return 'http://indobase-templates-server'
}

const tenantSmtpHost = resolveTenantSmtpHost()
const tenantSmtpPort = resolveTenantSmtpPort(tenantSmtpHost)
const tenantSmtpUser =
  process.env.SAAS_TENANT_SMTP_USER ?? process.env.SMTP_USER ?? 'fake_mail_user'
const tenantSmtpPass =
  process.env.SAAS_TENANT_SMTP_PASS ?? process.env.SMTP_PASS ?? 'fake_mail_password'
const tenantSmtpAdminEmail =
  process.env.SAAS_TENANT_SMTP_ADMIN_EMAIL ||
  process.env.SMTP_ADMIN_EMAIL ||
  'auth@indobase.in'
const tenantSmtpSenderName =
  process.env.SAAS_TENANT_SMTP_SENDER_NAME ||
  process.env.SMTP_SENDER_NAME ||
  'Indobase'
const tenantMailerTemplatesBase = resolveTenantMailerTemplatesBase()
const pgrstMaxRows = parseEnvNonNegInt('SAAS_TENANT_POSTGREST_DB_MAX_ROWS', 0)

function safeRef(ref) {
  if (!/^[a-z0-9-]+$/i.test(ref)) {
    console.error('PROJECT_REF must match /^[a-z0-9-]+$/i')
    process.exit(1)
  }
  return ref
}

safeRef(projectRef)

const outDir = path.join(process.cwd(), 'docker', 'tenants', projectRef)
fs.mkdirSync(outDir, { recursive: true })

function resolveTenantDbPassword() {
  const fromEnv = process.env.TENANT_DB_PASSWORD?.trim()
  if (fromEnv) return fromEnv

  const secretPath = path.join(outDir, '.tenant-db-password')
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim()
  }

  const generated = crypto.randomBytes(24).toString('base64url')
  fs.writeFileSync(secretPath, `${generated}\n`, { mode: 0o600 })
  return generated
}

const tenantDbPassword = resolveTenantDbPassword()

const compose = `# Generated by docker/tenants/render-tenant-stack.mjs
name: indobase-tenant-${projectRef}

services:
  tenant-db:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${tenantDbPassword}
      POSTGRES_DB: postgres
    ports:
      - "127.0.0.1:${base}:5432"
    volumes:
      - tenant-db-${projectRef}:/var/lib/postgresql/data:Z

  tenant-rest:
    image: postgrest/postgrest:v14.5
    restart: unless-stopped
    mem_limit: ${pgrstMem}
    depends_on:
      - tenant-db
    environment:
      PGRST_DB_URI: ${tenantDbUrl}
      PGRST_DB_SCHEMAS: public,storage,graphql_public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${jwtSecret}
      PGRST_DB_POOL: "${pgrstPool}"
      PGRST_DB_POOL_ACQUISITION_TIMEOUT: "${pgrstPoolAcquire}"
      PGRST_DB_POOL_MAX_IDLETIME: "${pgrstPoolIdle}"
      PGRST_DB_MAX_ROWS: "${pgrstMaxRows}"
    ports:
      - "127.0.0.1:${ports.rest}:3000"

  tenant-auth:
    image: supabase/gotrue:v2.186.0
    restart: unless-stopped
    depends_on:
      - tenant-db
    environment:
      GOTRUE_SITE_URL: https://${projectRef}.${publicDomain}
      GOTRUE_URI_ALLOW_LIST: https://${projectRef}.${publicDomain}
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: ${tenantDbUrl}
      GOTRUE_JWT_SECRET: ${jwtSecret}
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_MAILER_AUTOCONFIRM: "false"
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_INVITE: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_RECOVERY: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: ${tenantMailerTemplatesBase}/tenant-confirmation.html
      GOTRUE_MAILER_TEMPLATES_RECOVERY: ${tenantMailerTemplatesBase}/tenant-recovery.html
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: ${tenantMailerTemplatesBase}/tenant-magic-link.html
      GOTRUE_MAILER_TEMPLATES_INVITE: ${tenantMailerTemplatesBase}/tenant-invite.html
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: ${tenantMailerTemplatesBase}/tenant-email-change.html
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: Confirm your Indobase account
      GOTRUE_MAILER_SUBJECTS_RECOVERY: Reset your Indobase password
      GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: Your Indobase sign-in link
      GOTRUE_MAILER_SUBJECTS_INVITE: You are invited to Indobase
      GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE: Confirm your new Indobase email
      GOTRUE_SMTP_HOST: ${tenantSmtpHost}
      GOTRUE_SMTP_PORT: ${tenantSmtpPort}
      GOTRUE_SMTP_USER: ${tenantSmtpUser}
      GOTRUE_SMTP_PASS: ${tenantSmtpPass}
      GOTRUE_SMTP_ADMIN_EMAIL: ${tenantSmtpAdminEmail}
      GOTRUE_SMTP_SENDER_NAME: ${tenantSmtpSenderName}
    ports:
      - "127.0.0.1:${ports.auth}:9999"

  tenant-imgproxy:
    image: darthsim/imgproxy:v3.30.1
    restart: unless-stopped
    hostname: tenant-imgproxy-${projectRef}
    volumes:
      - tenant-storage-${projectRef}:/var/lib/storage:Z
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: "true"
      IMGPROXY_MAX_SRC_RESOLUTION: "16.8"
    expose:
      - "5001"

  tenant-storage:
    image: supabase/storage-api:v1.37.8
    restart: unless-stopped
    depends_on:
      - tenant-db
      - tenant-rest
      - tenant-imgproxy
    environment:
      ANON_KEY: ${anonKey}
      SERVICE_KEY: ${serviceKey}
      POSTGREST_URL: http://host.docker.internal:${ports.rest}
      PGRST_JWT_SECRET: ${jwtSecret}
      DATABASE_URL: ${tenantDbUrl}
      REQUEST_ALLOW_X_FORWARDED_PATH: "true"
      FILE_SIZE_LIMIT: "${storageFileLimit}"
      STORAGE_BACKEND: file
      GLOBAL_S3_BUCKET: tenant-${projectRef}
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      REGION: local
      TENANT_ID: ${projectRef}
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://tenant-imgproxy-${projectRef}:5001
      VECTOR_ENABLED: "true"
      VECTOR_BUCKET_PROVIDER: pgvector
      VECTOR_STORE_MIGRATIONS_ENABLED: "true"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - tenant-storage-${projectRef}:/var/lib/storage:Z
    ports:
      - "127.0.0.1:${ports.storage}:5000"

  tenant-realtime:
    image: supabase/realtime:v2.76.5
    restart: unless-stopped
    depends_on:
      - tenant-db
    environment:
      PORT: 4000
      DB_HOST: host.docker.internal
      DB_PORT: ${base}
      DB_USER: postgres
      DB_PASSWORD: ${tenantDbPassword}
      DB_NAME: postgres
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      JWT_SECRET: ${jwtSecret}
      SECURE_CHANNELS: "true"
      RLIMIT_NOFILE: "${rtNofile}"
      DB_POOL_SIZE: "${rtDbPool}"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "127.0.0.1:${ports.realtime}:4000"

  tenant-functions:
    image: supabase/edge-runtime:v1.67.1
    restart: unless-stopped
    mem_limit: ${edgeMem}
    environment:
      JWT_SECRET: ${jwtSecret}
      VERIFY_JWT: "true"
      SUPABASE_URL: https://${projectRef}.${publicDomain}
      SUPABASE_ANON_KEY: ${anonKey}
      SUPABASE_SERVICE_ROLE_KEY: ${serviceKey}
      SUPABASE_DB_URL: ${tenantDbUrl}
    volumes:
      - ../volumes/functions:/home/deno/functions:Z
    ports:
      - "127.0.0.1:${ports.functions}:9000"

  tenant-site:
    image: nginx:1.27-alpine
    restart: unless-stopped
    volumes:
      - ./site:/usr/share/nginx/html:ro
      - ./site-nginx.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "127.0.0.1:${ports.site}:8080"

volumes:
  tenant-db-${projectRef}:
  tenant-storage-${projectRef}:
`

const traefik = `# Generated by docker/tenants/render-tenant-stack.mjs
http:
  middlewares:
    tenant-${projectRef}-rest-strip:
      stripPrefix:
        prefixes:
          - "/rest/v1"
    tenant-${projectRef}-auth-strip:
      stripPrefix:
        prefixes:
          - "/auth/v1"
    tenant-${projectRef}-storage-strip:
      stripPrefix:
        prefixes:
          - "/storage/v1"
    tenant-${projectRef}-s3-strip:
      stripPrefix:
        prefixes:
          - "/s3"
    tenant-${projectRef}-realtime-strip:
      stripPrefix:
        prefixes:
          - "/realtime/v1"
    tenant-${projectRef}-functions-strip:
      stripPrefix:
        prefixes:
          - "/functions/v1"

  routers:
    tenant-${projectRef}-rest:
      rule: Host(\`${projectRef}.${publicDomain}\`) && PathPrefix(\`/rest/v1\`)
      priority: 100
      middlewares:
        - tenant-${projectRef}-rest-strip
      service: tenant-${projectRef}-rest
      entryPoints: [web, websecure]
    tenant-${projectRef}-auth:
      rule: Host(\`${projectRef}.${publicDomain}\`) && PathPrefix(\`/auth/v1\`)
      priority: 100
      middlewares:
        - tenant-${projectRef}-auth-strip
      service: tenant-${projectRef}-auth
      entryPoints: [web, websecure]
    tenant-${projectRef}-storage:
      rule: Host(\`${projectRef}.${publicDomain}\`) && PathPrefix(\`/storage/v1\`)
      priority: 100
      middlewares:
        - tenant-${projectRef}-storage-strip
      service: tenant-${projectRef}-storage
      entryPoints: [web, websecure]
    tenant-${projectRef}-s3:
      rule: Host(\`${projectRef}.${publicDomain}\`) && PathPrefix(\`/s3\`)
      priority: 100
      middlewares:
        - tenant-${projectRef}-s3-strip
      service: tenant-${projectRef}-storage
      entryPoints: [web, websecure]
    tenant-${projectRef}-realtime:
      rule: Host(\`${projectRef}.${publicDomain}\`) && PathPrefix(\`/realtime/v1\`)
      priority: 100
      middlewares:
        - tenant-${projectRef}-realtime-strip
      service: tenant-${projectRef}-realtime
      entryPoints: [web, websecure]
    tenant-${projectRef}-functions:
      rule: Host(\`${projectRef}.${publicDomain}\`) && PathPrefix(\`/functions/v1\`)
      priority: 100
      middlewares:
        - tenant-${projectRef}-functions-strip
      service: tenant-${projectRef}-functions
      entryPoints: [web, websecure]
    tenant-${projectRef}-site:
      rule: Host(\`${projectRef}.${publicDomain}\`)
      priority: 1
      service: tenant-${projectRef}-site
      entryPoints: [web, websecure]

  services:
    tenant-${projectRef}-rest:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.rest}" }]
        passHostHeader: true
    tenant-${projectRef}-auth:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.auth}" }]
        passHostHeader: true
    tenant-${projectRef}-storage:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.storage}" }]
        passHostHeader: true
    tenant-${projectRef}-realtime:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.realtime}" }]
        passHostHeader: true
    tenant-${projectRef}-functions:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.functions}" }]
        passHostHeader: true
    tenant-${projectRef}-site:
      loadBalancer:
        servers: [{ url: "http://127.0.0.1:${ports.site}" }]
        passHostHeader: true
`

fs.writeFileSync(path.join(outDir, 'docker-compose.yml'), compose, 'utf8')
fs.writeFileSync(path.join(outDir, 'traefik.yml'), traefik, 'utf8')
fs.mkdirSync(path.join(outDir, 'site'), { recursive: true })
fs.writeFileSync(
  path.join(outDir, 'site-nginx.conf'),
  `server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
`,
  'utf8'
)

console.log(`Wrote ${path.relative(process.cwd(), path.join(outDir, 'docker-compose.yml'))}`)
console.log(`Wrote ${path.relative(process.cwd(), path.join(outDir, 'traefik.yml'))}`)
console.log(`Ports: ${JSON.stringify(ports)}`)
console.log(`Tenant DB password: ${process.env.TENANT_DB_PASSWORD?.trim() ? 'from TENANT_DB_PASSWORD' : 'stored in .tenant-db-password (local only)'}`)

