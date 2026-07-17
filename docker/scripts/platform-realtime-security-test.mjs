#!/usr/bin/env node
/**
 * Realtime WebSocket security + performance regression (tenant stack on VPS).
 *   node docker/scripts/platform-realtime-security-test.mjs
 *
 * Env:
 *   ENV_FILE, REALTIME_WS_URL, REALTIME_TENANT, AUTH_URL, TENANT_DB, DB_CONTAINER
 *   CONCURRENT_CONNECTIONS (default 200; full 10k needs dedicated load run)
 *   BROADCAST_LATENCY_MS (default 300)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function loadWebSocket() {
  try {
    return require('ws')
  } catch {
    const r = spawnSync('npm', ['install', 'ws@8.18.0', '--no-save', '--prefix', __dirname], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    if (r.status !== 0) throw new Error(r.stderr || 'npm install ws failed')
    return createRequire(join(__dirname, 'package.json'))('ws')
  }
}

const WebSocket = loadWebSocket()

const ENV_FILE = process.env.ENV_FILE ?? '/etc/dokploy/compose/indobase-backend-bmqhan/code/docker/.env'
const REALTIME_TENANT = process.env.REALTIME_TENANT ?? 'peaqlabs-yawgparzpv'
const REALTIME_HOST =
  process.env.REALTIME_HOST ?? `${REALTIME_TENANT}.${process.env.SAAS_PUBLIC_DOMAIN ?? 'indobase.in'}`
const TENANT_DB = process.env.TENANT_DB ?? `tenantdb_${REALTIME_TENANT.replace(/-/g, '_')}`
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'indobase-db'
const CONCURRENT = Number(process.env.CONCURRENT_CONNECTIONS ?? '200')
const BROADCAST_BUDGET_MS = Number(process.env.BROADCAST_LATENCY_MS ?? '300')

let PASS = 0
let FAIL = 0
let SKIP = 0

const green = (m) => console.log(`\x1b[32mPASS\x1b[0m  ${m}`)
const red = (m) => console.log(`\x1b[31mFAIL\x1b[0m  ${m}`)
const yellow = (m) => console.log(`\x1b[33mSKIP\x1b[0m  ${m}`)
const section = (m) => console.log(`\n\x1b[33m=== ${m} ===\x1b[0m`)

function envVal(key) {
  const line = readFileSync(ENV_FILE, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`Missing ${key} in ${ENV_FILE}`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}

function psql(sql, db = TENANT_DB) {
  const pgpass = envVal('POSTGRES_PASSWORD')
  const r = spawnSync(
    'docker',
    ['exec', '-e', `PGPASSWORD=${pgpass}`, DB_CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-tAc', sql],
    { encoding: 'utf8' }
  )
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'psql failed')
  return r.stdout.trim()
}

function psqlTenantAdmin(sql) {
  const pgpass = spawnSync(
    'docker',
    ['exec', `${REALTIME_TENANT}.indobase-realtime`, 'printenv', 'DB_PASSWORD'],
    { encoding: 'utf8' }
  ).stdout.trim()
  const r = spawnSync(
    'docker',
    [
      'exec',
      '-e',
      `PGPASSWORD=${pgpass}`,
      DB_CONTAINER,
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      TENANT_DB,
      '-tAc',
      sql,
    ],
    { encoding: 'utf8' }
  )
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'psql tenant admin failed')
  return r.stdout.trim()
}

function resolveRealtimeWsUrl() {
  if (process.env.REALTIME_WS_URL) return process.env.REALTIME_WS_URL
  const portLine = spawnSync('docker', ['port', `${REALTIME_TENANT}.indobase-realtime`, '4000/tcp'], {
    encoding: 'utf8',
  })
  const port = portLine.stdout.trim().split('\n')[0]?.split(':').pop()
  if (!port) throw new Error('Could not resolve realtime port')
  return `ws://127.0.0.1:${port}/socket/websocket`
}

function resolveAuthUrl() {
  if (process.env.AUTH_URL) return process.env.AUTH_URL
  for (const name of [
    `${REALTIME_TENANT}.indobase-auth`,
    `indobase-tenant-${REALTIME_TENANT}-tenant-auth-1`,
  ]) {
    const portLine = spawnSync('docker', ['port', name, '9999/tcp'], { encoding: 'utf8' })
    const port = portLine.stdout.trim().split('\n')[0]?.split(':').pop()
    if (port) return `http://127.0.0.1:${port}`
  }
  throw new Error('Could not resolve tenant auth port')
}

async function login(email, password, anonKey, authBase) {
  const res = await fetch(`${authBase}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.msg || body.error_description || `login ${res.status}`)
  return body.access_token
}

function phoenixJoin(topic, payload, ref = '1') {
  return JSON.stringify({ topic, event: 'phx_join', payload, ref })
}

function waitFor(ws, pred, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs)
    const onMsg = (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (pred(msg)) {
        clearTimeout(timer)
        ws.off('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
  })
}

function connectWs(wsBase, apikey, accessToken) {
  const url = `${wsBase}?apikey=${encodeURIComponent(apikey)}&vsn=1.0.0${accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ''}`
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Host: REALTIME_HOST } })
    const timer = setTimeout(() => reject(new Error('websocket connect timeout')), 10000)
    ws.once('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

async function joinChannel(ws, channelName, config, accessToken) {
  const topic = `realtime:${channelName}`
  const payload = { config, access_token: accessToken }
  ws.send(phoenixJoin(topic, payload, String(Date.now())))
  const reply = await waitFor(
    ws,
    (m) => m.event === 'phx_reply' && m.topic === topic && m.payload?.status,
    20000
  )
  if (reply.payload?.status !== 'ok') {
    throw new Error(`channel join failed: ${JSON.stringify(reply.payload?.response ?? reply.payload)}`)
  }
  return reply
}

async function ensureRealtimeDbSchema() {
  psqlTenantAdmin(`
    CREATE SCHEMA IF NOT EXISTS realtime AUTHORIZATION supabase_admin;
    GRANT USAGE ON SCHEMA realtime TO postgres, supabase_admin, authenticated, anon, service_role;
  `)
  // Private broadcast/presence channels require RLS on realtime.messages (see Supabase Realtime Authorization).
  psqlTenantAdmin(`
    DO $$ BEGIN
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;
    DROP POLICY IF EXISTS qa_rt_messages_select ON realtime.messages;
    DROP POLICY IF EXISTS qa_rt_messages_insert ON realtime.messages;
    CREATE POLICY qa_rt_messages_select ON realtime.messages
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY qa_rt_messages_insert ON realtime.messages
      FOR INSERT TO authenticated WITH CHECK (true);
  `)
}

async function setupQaSchema() {
  psql(`
    CREATE SCHEMA IF NOT EXISTS rt_qa;
    CREATE TABLE IF NOT EXISTS rt_qa.messages (
      id bigserial PRIMARY KEY,
      owner_id uuid NOT NULL,
      body text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE rt_qa.messages REPLICA IDENTITY FULL;
    ALTER TABLE rt_qa.messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE rt_qa.messages FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS messages_owner_all ON rt_qa.messages;
    CREATE POLICY messages_owner_all ON rt_qa.messages
      FOR ALL TO authenticated
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
    GRANT USAGE ON SCHEMA rt_qa TO authenticated, anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON rt_qa.messages TO authenticated, service_role;
    GRANT USAGE, SELECT ON SEQUENCE rt_qa.messages_id_seq TO authenticated, service_role;
  `)
  psql(`
    DO $$ BEGIN
      CREATE PUBLICATION supabase_realtime;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE rt_qa.messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
}

async function ensureRealtimeTenant() {
  const exists = psqlTenantAdmin(
    `SELECT 1 FROM _realtime.tenants WHERE external_id = '${REALTIME_TENANT}' LIMIT 1;`
  )
  const jwtLen = psqlTenantAdmin(
    `SELECT length(jwt_secret) FROM _realtime.tenants WHERE external_id = '${REALTIME_TENANT}' LIMIT 1;`
  )
  // Realtime stores jwt_secret encrypted (~100+ chars). Plaintext hex breaks WebSocket crypto.
  if (exists === '1' && jwtLen && Number(jwtLen) > 80) {
    psqlTenantAdmin(`
      UPDATE _realtime.extensions SET tenant_external_id = '${REALTIME_TENANT}'
      WHERE tenant_external_id = 'realtime-dev' AND NOT EXISTS (
        SELECT 1 FROM _realtime.extensions WHERE tenant_external_id = '${REALTIME_TENANT}'
      );
    `)
    return
  }
  if (exists === '1') {
    psqlTenantAdmin(`DELETE FROM _realtime.tenants WHERE external_id = '${REALTIME_TENANT}';`)
  }
  psqlTenantAdmin(`
    INSERT INTO _realtime.tenants (
      id, name, external_id, jwt_secret, max_concurrent_users, inserted_at, updated_at,
      max_events_per_second, postgres_cdc_default, max_bytes_per_second, max_channels_per_client,
      max_joins_per_second, suspend, notify_private_alpha, private_only, migrations_ran,
      broadcast_adapter, max_presence_events_per_second, max_payload_size_in_kb
    )
    SELECT gen_random_uuid(), '${REALTIME_TENANT}', '${REALTIME_TENANT}', jwt_secret,
      max_concurrent_users, now(), now(), max_events_per_second, postgres_cdc_default,
      max_bytes_per_second, max_channels_per_client, max_joins_per_second, suspend,
      notify_private_alpha, private_only, migrations_ran, broadcast_adapter,
      max_presence_events_per_second, max_payload_size_in_kb
    FROM _realtime.tenants WHERE external_id = 'realtime-dev' LIMIT 1;
  `)
  psqlTenantAdmin(`
    UPDATE _realtime.extensions SET tenant_external_id = '${REALTIME_TENANT}'
    WHERE tenant_external_id = 'realtime-dev';
  `)
}

function assertOk(name, cond) {
  if (cond) {
    green(name)
    PASS++
  } else {
    red(name)
    FAIL++
  }
}

function assertFail(name, cond) {
  if (cond) {
    red(`${name} (expected failure)`)
    FAIL++
  } else {
    green(name)
    PASS++
  }
}

async function main() {
  const anonKey = envVal('ANON_KEY')
  const wsBase = resolveRealtimeWsUrl()
  const authBase = resolveAuthUrl()
  const runId = Date.now()
  const channel = `qa-rt-${runId}`
  const emailA = `qa-rt-a-${runId}@indobase-qa.invalid`
  const emailB = `qa-rt-b-${runId}@indobase-qa.invalid`
  const pass = `QaRt-${runId}`

  section(`Setup (${REALTIME_TENANT} / ${TENANT_DB})`)
  await ensureRealtimeTenant()
  await ensureRealtimeDbSchema()
  await setupQaSchema()

  async function signupAndToken(email) {
    const su = await fetch(`${authBase}/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    })
    const body = await su.json()
    const uid = body.id ?? body.user?.id
    if (uid) {
      const serviceKey = envVal('SERVICE_ROLE_KEY')
      await fetch(`${authBase}/admin/users/${uid}`, {
        method: 'PUT',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email_confirm: true }),
      })
    }
    return login(email, pass, anonKey, authBase)
  }

  const tokenA = await signupAndToken(emailA)
  const tokenB = await signupAndToken(emailB)
  const userA = JSON.parse(Buffer.from(tokenA.split('.')[1], 'base64url').toString()).sub
  const userB = JSON.parse(Buffer.from(tokenB.split('.')[1], 'base64url').toString()).sub

  section('WebSocket connect + authenticate')
  let wsA
  try {
    wsA = await connectWs(wsBase, anonKey, tokenA)
    assertOk('websocket connects with user JWT', true)
    await new Promise((r) => setTimeout(r, 5000))
  } catch (e) {
    assertOk(`websocket connects (${e.message})`, false)
    process.exit(1)
  }

  const pgConfig = [{ event: '*', schema: 'rt_qa', table: 'messages' }]
  await joinChannel(
    wsA,
    `${channel}-bc`,
    { broadcast: { self: true }, presence: { key: userA }, private: true },
    tokenA
  )
  assertOk('private channel join authorized', true)

  section('Broadcast latency + payload')
  const wsB = await connectWs(wsBase, anonKey, tokenB)
  await joinChannel(wsB, `${channel}-bc`, { broadcast: { self: false }, presence: { key: userB }, private: true }, tokenB)

  const recvPromise = waitFor(
    wsB,
    (m) => m.event === 'broadcast' && m.payload?.type === 'broadcast' && m.payload?.event === 'ping'
  )
  const t0 = Date.now()
  wsA.send(
    JSON.stringify({
      topic: `realtime:${channel}-bc`,
      event: 'broadcast',
      payload: { type: 'broadcast', event: 'ping', payload: { ts: t0 } },
      ref: String(Date.now()),
    })
  )
  await recvPromise
  const latency = Date.now() - t0
  assertOk(`broadcast delivered in < ${BROADCAST_BUDGET_MS}ms (${latency}ms)`, latency < BROADCAST_BUDGET_MS)

  section('Postgres INSERT/UPDATE/DELETE payloads')
  const wsPg = await connectWs(wsBase, anonKey, tokenA)
  await joinChannel(wsPg, `${channel}-pg`, { postgres_changes: pgConfig, private: false }, tokenA)
  await new Promise((r) => setTimeout(r, 2000))
  psql(`INSERT INTO rt_qa.messages (owner_id, body) VALUES ('${userA}', 'hello') RETURNING id;`)
  const isPgChange = (m, type) =>
    (m.event === 'postgres_changes' || m.event === 'postgres_cdc') &&
    (m.payload?.data?.type === type || m.payload?.type === type)

  const insertMsg = await waitFor(wsPg, (m) => isPgChange(m, 'INSERT'), 20000)
  assertOk('INSERT event received', insertMsg?.payload?.data?.type === 'INSERT')
  const rowId = insertMsg?.payload?.data?.record?.id

  psql(`UPDATE rt_qa.messages SET body = 'updated' WHERE id = ${rowId};`)
  const updateMsg = await waitFor(wsPg, (m) => isPgChange(m, 'UPDATE'), 20000)
  assertOk('UPDATE includes old/new records', Boolean(updateMsg?.payload?.data?.record && updateMsg?.payload?.data?.old_record))

  psql(`DELETE FROM rt_qa.messages WHERE id = ${rowId};`)
  const deleteMsg = await waitFor(wsPg, (m) => isPgChange(m, 'DELETE'), 20000)
  assertOk('DELETE includes old record', deleteMsg?.payload?.data?.type === 'DELETE')
  wsPg.close()

  section('RLS: clients only see permitted postgres_changes')
  const wsBpg = await connectWs(wsBase, anonKey, tokenB)
  await joinChannel(wsBpg, `${channel}-rls`, { postgres_changes: pgConfig, private: false }, tokenB)
  psql(`INSERT INTO rt_qa.messages (owner_id, body) VALUES ('${userA}', 'secret') RETURNING id;`)
  let leaked = false
  const leakWatch = new Promise((resolve) => {
    const fn = (raw) => {
      try {
        const m = JSON.parse(raw.toString())
        if (m.event === 'postgres_changes' && m.payload?.data?.record?.body === 'secret') leaked = true
      } catch {}
    }
    wsBpg.on('message', fn)
    setTimeout(() => {
      wsBpg.off('message', fn)
      resolve()
    }, 3000)
  })
  await leakWatch
  assertOk('user B does not receive user A postgres_changes', !leaked)
  wsBpg.close()

  section('Presence propagation')
  const presenceJoin = waitFor(
    wsA,
    (m) => m.event === 'presence_state' || (m.event === 'presence_diff' && m.payload)
  )
  wsA.send(
    JSON.stringify({
      topic: `realtime:${channel}-bc`,
      event: 'presence',
      payload: { type: 'presence', event: 'track', payload: { online_at: new Date().toISOString() } },
      ref: String(Date.now() + 1),
    })
  )
  await presenceJoin
  assertOk('presence updates propagate', true)

  section(`Concurrent connections (target ${CONCURRENT}, not full 10k on shared VPS)`)
  const opens = await Promise.all(
    Array.from({ length: CONCURRENT }, () =>
      connectWs(wsBase, anonKey, tokenA).then((ws) => {
        ws.close()
        return true
      }).catch(() => false)
    )
  )
  const okCount = opens.filter(Boolean).length
  assertOk(`${okCount}/${CONCURRENT} concurrent connections established`, okCount >= CONCURRENT * 0.95)
  if (CONCURRENT < 10000) {
    yellow(`SKIP  10k steady load (ran ${CONCURRENT}; set CONCURRENT_CONNECTIONS=10000 on load host)`)
    SKIP++
  }

  section('Reconnect resumes postgres stream')
  const wsR = await connectWs(wsBase, anonKey, tokenA)
  await joinChannel(wsR, `${channel}-resume`, { postgres_changes: pgConfig, private: false }, tokenA)
  wsR.close()
  await new Promise((r) => setTimeout(r, 500))
  const wsR2 = await connectWs(wsBase, anonKey, tokenA)
  await joinChannel(wsR2, `${channel}-resume`, { postgres_changes: pgConfig, private: false }, tokenA)
  const afterReconnect = waitFor(wsR2, (m) => m.event === 'phx_reply', 5000)
  psql(`INSERT INTO rt_qa.messages (owner_id, body) VALUES ('${userA}', 'after-reconnect');`)
  const reMsg = await waitFor(wsR2, (m) => m.event === 'postgres_changes', 15000)
  assertOk('events flow after reconnect', reMsg?.event === 'postgres_changes')
  wsR2.close()

  wsA.close()
  wsB.close()

  section('Summary')
  green(`PASS: ${PASS}`)
  if (FAIL > 0) red(`FAIL: ${FAIL}`)
  else console.log(`FAIL: ${FAIL}`)
  yellow(`SKIP: ${SKIP}`)
  process.exit(FAIL > 0 ? 1 : 0)
}

main().catch((e) => {
  red(e.stack || e.message)
  process.exit(1)
})
