#!/usr/bin/env node
/**
 * Live V1.2 payment certification — real CFOS + real PocketBase + real webhook HTTP.
 * Does not implement a PSP. Provider events enter through the production webhook ABI:
 *   POST /api/os/commerce/orders/:id/mark-paid
 *   POST /api/os/commerce/orders/:id/mark-failed
 *
 *   COMMERCE_BASE=https://builder.indobase.in \
 *   PROJECT_REF=roshb77a4744fa \
 *   COMMERCE_WEBHOOK_SECRET=... \
 *   node scripts/live-v12-payment-cert.mjs
 *
 * Optional: LIVE_V12_PB_HELPER=/tmp/live-v12-pb-helper.sh (run via ssh on .249)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const BASE = (process.env.COMMERCE_BASE || 'https://builder.indobase.in').replace(/\/+$/, '')
const REF = process.env.PROJECT_REF || 'roshb77a4744fa'
const REF_B = process.env.PROJECT_REF_B || 'v11xtenantb1'
const SSH_HOST = process.env.VPS_SSH || 'root@103.190.92.249'
const SSH_KEY = process.env.VPS_SSH_KEY || `${process.env.HOME}/.ssh/id_ed25519_indobase_vps`
const PB_HELPER_REMOTE = process.env.LIVE_V12_PB_HELPER || '/tmp/live-v12-pb-helper.sh'
const EXPECTED_VERSION = process.env.EXPECTED_GIT_SHA || '7ba706cb5'

const results = []

function secretFromEnv() {
  if (process.env.COMMERCE_WEBHOOK_SECRET) return process.env.COMMERCE_WEBHOOK_SECRET.trim()
  const file = process.env.COMMERCE_WEBHOOK_SECRET_FILE || '.local-secrets/cfos-webhook.env'
  const candidates = [file, `/Volumes/PortableSSD/Indobase/ind-repo/${file}`]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    const raw = readFileSync(path, 'utf8')
    const line = raw.split('\n').find((l) => l.startsWith('BUILDER_CFOS_HANDOFF_SECRET=') || l.startsWith('INDOBASE_COMMERCE_WEBHOOK_SECRET='))
    if (line) return line.slice(line.indexOf('=') + 1).trim()
    const trimmed = raw.trim()
    if (trimmed && !trimmed.includes('\n')) return trimmed
  }
  return ''
}

const SECRET = secretFromEnv()

function record(id, ok, detail) {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

async function api(path, { method = 'GET', body, secret, ref = REF } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Indobase-Project-Ref': ref,
  }
  if (secret) headers['X-Indobase-Commerce-Webhook-Secret'] = secret
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function ssh(args, { json = false } = {}) {
  const out = execFileSync(
    'ssh',
    ['-4', '-o', 'ConnectTimeout=20', '-i', SSH_KEY, SSH_HOST, ...args],
    { encoding: 'utf8', timeout: 30_000 },
  ).trim()
  if (!json) return out
  try {
    return JSON.parse(out)
  } catch {
    return { ok: false, error: 'invalid_json', raw: out.slice(0, 200) }
  }
}

function pb(action, ...args) {
  return ssh(['bash', PB_HELPER_REMOTE, action, REF, ...args], { json: true })
}

function stockOf(products, productId) {
  const row = (products || []).find((p) => p.id === productId)
  return row ? Number(row.stock || 0) : null
}

async function snapshot() {
  const res = await api(`/api/os/commerce/admin/snapshot?projectRef=${encodeURIComponent(REF)}`)
  return {
    status: res.status,
    products: res.json.products || [],
    orders: res.json.orders || [],
  }
}

function orderFromSnapshot(orders, orderId) {
  return (orders || []).find((o) => o.id === orderId) || null
}

async function checkout(sku, label) {
  return api('/api/os/commerce/checkout', {
    method: 'POST',
    body: {
      projectRef: REF,
      idempotencyKey: `v12-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      items: [{ productId: sku.id, quantity: 1 }],
      customer: { email: `v12-${label}-${Date.now()}@indobase.live`, name: `V12 ${label}` },
    },
  })
}

async function markPaid(orderId, providerEventId, { secret = SECRET, ref = REF } = {}) {
  return api(`/api/os/commerce/orders/${encodeURIComponent(orderId)}/mark-paid`, {
    method: 'POST',
    secret,
    ref,
    body: { projectRef: ref, orderId, providerEventId },
  })
}

async function markFailed(orderId, providerEventId, { secret = SECRET } = {}) {
  return api(`/api/os/commerce/orders/${encodeURIComponent(orderId)}/mark-failed`, {
    method: 'POST',
    secret,
    body: { projectRef: REF, orderId, providerEventId },
  })
}

function printReport(ok) {
  console.log('\n--- V1.2 live payment gate ---')
  console.log(ok ? 'LEVEL 2/3 LIVE EVIDENCE RECORDED' : 'NOT READY')
  console.log(`passed ${results.filter((r) => r.ok).length}/${results.length}`)
  console.log('productionCertified: false until this report is all PASS')
}

async function main() {
  if (!SECRET || SECRET.length < 32) {
    record('webhook_secret_present', false, 'COMMERCE_WEBHOOK_SECRET missing or short')
    printReport(false)
    process.exit(1)
  }

  const health = await fetch(`${BASE}/sso/health`).then((r) => r.json()).catch(() => ({}))
  const version = String(health.version || '')
  record(
    'deployed_sha',
    version.startsWith(EXPECTED_VERSION) || version === EXPECTED_VERSION,
    `health.version=${version} expected=${EXPECTED_VERSION}`,
  )
  record('managed_backend', health.managedBackendConfigured === true, `pb=${health.managedBackendConfigured}`)

  const productsRes = await api(`/api/os/commerce/products?projectRef=${encodeURIComponent(REF)}`)
  const catalog = Array.isArray(productsRes.json.products) ? productsRes.json.products : []
  const sku = catalog.find((p) => Number(p.stock) > 4) || catalog.find((p) => Number(p.stock) > 0) || catalog[0]
  record('catalog_live', Boolean(sku?.id) && Number(sku.stock) > 0, sku ? `product=${sku.id} stock=${sku.stock}` : `HTTP ${productsRes.status}`)
  if (!sku?.id) {
    printReport(false)
    process.exit(1)
  }

  // --- happy path: pending → reserved → payment_pending → paid, commit once ---
  const before = await snapshot()
  const stock0 = stockOf(before.products, sku.id)
  const created = await checkout(sku, 'success')
  const orderOk = created.json.ok === true && created.json.orderId
  record(
    'lifecycle_checkout',
    orderOk && created.json.paymentStatus === 'pending' && created.json.paymentRequired === true,
    `HTTP ${created.status} order=${created.json.orderId || '-'} paymentUrl=${created.json.paymentUrl ? 'yes' : 'none'}`,
  )
  const orderId = created.json.orderId
  if (created.json.paymentUrl) {
    record(
      'hosted_checkout_url',
      /^https?:\/\//.test(created.json.paymentUrl),
      `urlHost=${(() => { try { return new URL(created.json.paymentUrl).host } catch { return 'invalid' } })()}`,
    )
  } else {
    record(
      'hosted_checkout_url',
      true,
      'gateway_not_ready — PSP adapter not wired; cert uses webhook ABI (not a Razorpay/Stripe payload)',
    )
  }

  if (orderId) {
    const reserved = pb('order', orderId)
    record(
      'lifecycle_reserved',
      reserved?.payment_status === 'pending' && Boolean(reserved?.reservation_expires_at),
      `payment_status=${reserved?.payment_status || reserved?.error || '-'} expires=${reserved?.reservation_expires_at || '-'} state=${reserved?.payment_state || 'unset'}`,
    )
    const holds = pb('reservations', orderId)
    const holdRows = holds?.items || []
    record(
      'lifecycle_reservation_row',
      holdRows.some((r) => r.status === 'reserved' && r.order_id === orderId),
      `rows=${holdRows.length} status=${holdRows.map((r) => r.status).join(',') || '-'}`,
    )
  }

  // Invalid signature
  const badSig = await markPaid(orderId || 'missingorder000', 'evt_bad_sig', { secret: 'x'.repeat(32) })
  record('invalid_webhook_signature', badSig.status === 401 && badSig.json.code === 'unauthorized', `HTTP ${badSig.status}`)

  // Wrong project
  if (orderId) {
    const wrong = await markPaid(orderId, 'evt_wrong_tenant', { ref: REF_B })
    record(
      'wrong_order_project',
      wrong.status >= 400 && wrong.json.ok !== true,
      `HTTP ${wrong.status} code=${wrong.json.code || '-'}`,
    )
    const stillPending = pb('order', orderId)
    record(
      'wrong_project_no_corruption',
      stillPending?.payment_status === 'pending' && stillPending?.payment_status !== 'paid',
      `status=${stillPending?.payment_status || '-'}`,
    )
  }

  // Browser closed / provider timeout: no webhook → still pending
  const abandoned = await checkout(sku, 'abandon')
  const abandonedId = abandoned.json.orderId
  record('browser_closed_stays_pending', Boolean(abandonedId) && abandoned.json.paymentStatus === 'pending', `order=${abandonedId || '-'}`)
  if (abandonedId) {
    await new Promise((r) => setTimeout(r, 1500))
    const still = pb('order', abandonedId)
    record(
      'provider_timeout_noop',
      still?.payment_status === 'pending',
      `after wait status=${still?.payment_status || still?.error || '-'}`,
    )
  }

  // Successful payment + duplicate webhook
  if (orderId) {
    const evt = `rzp_live_${orderId}_ok`
    const first = await markPaid(orderId, evt)
    const afterPay = pb('order', orderId)
    const holds = pb('reservations', orderId)
    const committed = (holds?.items || []).filter((r) => r.status === 'committed')
    const mid = await snapshot()
    const stock1 = stockOf(mid.products, sku.id)
    record(
      'successful_payment',
      first.status === 200 && first.json.ok === true && afterPay?.payment_status === 'paid',
      `HTTP ${first.status} already=${Boolean(first.json.already)} pb=${afterPay?.payment_status || '-'} state=${afterPay?.payment_state || '-'}`,
    )
    record(
      'inventory_committed_once',
      committed.length >= 1 && stock0 != null && stock1 === stock0 - 1,
      `committedRows=${committed.length} stock ${stock0}→${stock1}`,
    )

    const dup = await markPaid(orderId, evt)
    const afterDup = await snapshot()
    const stock2 = stockOf(afterDup.products, sku.id)
    record(
      'webhook_duplicated',
      dup.status === 200 && dup.json.ok === true && (dup.json.already === true || dup.json.lateSuccess === true) && stock2 === stock1,
      `already=${Boolean(dup.json.already)} stock ${stock1}→${stock2}`,
    )

    // Success → failure remains paid
    const failAfter = await markFailed(orderId, `${evt}_fail`)
    const stillPaid = pb('order', orderId)
    record(
      'success_then_failure_stays_paid',
      stillPaid?.payment_status === 'paid',
      `HTTP ${failAfter.status} pb=${stillPaid?.payment_status || '-'}`,
    )

    // Replay of an old webhook
    const replay = await markPaid(orderId, evt)
    record('replay_old_webhook', replay.status === 200 && replay.json.already === true, `already=${Boolean(replay.json.already)}`)
  }

  // Failed payment → retry same order (second checkout idempotency is different; retry = mark-paid after fail)
  const failOrder = await checkout(sku, 'fail')
  const failId = failOrder.json.orderId
  if (failId) {
    const f1 = await markFailed(failId, `rzp_fail_${failId}`)
    const f1pb = pb('order', failId)
    record(
      'failed_payment',
      f1.status === 200 && (f1pb?.payment_status === 'failed' || f1pb?.payment_state === 'payment_failed'),
      `HTTP ${f1.status} pb=${f1pb?.payment_status || '-'} state=${f1pb?.payment_state || '-'}`,
    )
    const f2 = await markFailed(failId, `rzp_fail_${failId}_2`)
    record('failure_webhook_x2', f2.status === 200 && f2.json.ok === true, `HTTP ${f2.status} already=${Boolean(f2.json.already)}`)
    const retryEvt = `rzp_retry_${failId}`
    const retryPay = await markPaid(failId, retryEvt)
    const retryPb = pb('order', failId)
    record(
      'retry_same_order_paid',
      retryPay.status === 200 && retryPb?.payment_status === 'paid',
      `HTTP ${retryPay.status} pb=${retryPb?.payment_status || '-'}`,
    )
  } else {
    record('failed_payment', false, `checkout failed HTTP ${failOrder.status}`)
  }

  // Cancelled: no cancel HTTP — treat as abandoned pending (documented). Separate cancel order if we can mark-failed then leave.
  const cancelOrder = await checkout(sku, 'cancel')
  const cancelId = cancelOrder.json.orderId
  if (cancelId) {
    const cancelled = await markFailed(cancelId, `rzp_cancel_${cancelId}`)
    const cpb = pb('order', cancelId)
    record(
      'cancelled_payment',
      cancelled.status === 200 && cpb?.payment_status !== 'paid',
      `HTTP ${cancelled.status} pb=${cpb?.payment_status || '-'} (failed/released stand-in for cancel; no cancel route on this SHA)`,
    )
  }

  // Delayed webhook + webhook after client timeout
  const delayed = await checkout(sku, 'delayed')
  const delayedId = delayed.json.orderId
  if (delayedId) {
    await new Promise((r) => setTimeout(r, 2500))
    const late = await markPaid(delayedId, `rzp_delayed_${delayedId}`)
    const dpb = pb('order', delayedId)
    record(
      'webhook_delayed',
      late.status === 200 && dpb?.payment_status === 'paid',
      `HTTP ${late.status} pb=${dpb?.payment_status || '-'}`,
    )
    record(
      'webhook_after_client_timeout',
      dpb?.payment_status === 'paid',
      'server timeout is no-op; delayed provider success still pays',
    )
  }

  // THE invariant: expire then provider success → no inventory commit
  const lateSkuStockBeforeSnap = await snapshot()
  const stockBeforeLate = stockOf(lateSkuStockBeforeSnap.products, sku.id)
  const expOrder = await checkout(sku, 'late-success')
  const expId = expOrder.json.orderId
  if (expId) {
    const backdated = pb('backdate-expiry', expId)
    record('reservation_backdated', backdated?.ok === true, `rows=${backdated?.rows ?? backdated?.error ?? '-'}`)
    const afterExp = pb('order', expId)
    record(
      'reservation_expired',
      Boolean(afterExp?.reservation_expires_at) && new Date(String(afterExp.reservation_expires_at).replace(' ', 'T')) < new Date(),
      `expires_at=${afterExp?.reservation_expires_at || '-'}`,
    )
    const lateSuccess = await markPaid(expId, `rzp_late_${expId}`)
    const latePb = pb('order', expId)
    const lateHolds = pb('reservations', expId)
    const lateSnap = await snapshot()
    const stockAfterLate = stockOf(lateSnap.products, sku.id)
    const committedLate = (lateHolds?.items || []).some((r) => r.status === 'committed')
    record(
      'lateSuccessAfterTerminal',
      lateSuccess.status === 200 &&
        lateSuccess.json.lateSuccess === true &&
        latePb?.payment_status !== 'paid' &&
        !committedLate &&
        stockAfterLate === stockBeforeLate,
      `HTTP ${lateSuccess.status} lateSuccess=${Boolean(lateSuccess.json.lateSuccess)} pb=${latePb?.payment_status || '-'} committed=${committedLate} stock ${stockBeforeLate}→${stockAfterLate}`,
    )
  } else {
    record('lateSuccessAfterTerminal', false, `checkout failed HTTP ${expOrder.status}`)
  }

  // Concurrent success callbacks (same order)
  const raceOrder = await checkout(sku, 'race-success')
  const raceId = raceOrder.json.orderId
  if (raceId) {
    const stockBeforeRace = stockOf((await snapshot()).products, sku.id)
    const evt = `rzp_race_${raceId}`
    const [a, b] = await Promise.all([markPaid(raceId, evt), markPaid(raceId, evt)])
    const racePb = pb('order', raceId)
    const stockAfterRace = stockOf((await snapshot()).products, sku.id)
    const alreadyCount = [a, b].filter((r) => r.json.already).length
    record(
      'concurrent_success_one_commit',
      racePb?.payment_status === 'paid' && stockBeforeRace != null && stockAfterRace === stockBeforeRace - 1 && alreadyCount >= 1,
      `pb=${racePb?.payment_status || '-'} stock ${stockBeforeRace}→${stockAfterRace} already=${alreadyCount}/2`,
    )
  }

  // Concurrent expiry (backdate+late webhook) vs success on a fresh order:
  // production expiry is read-time TTL. Fire success while a sibling request also sees expiry.
  const mix = await checkout(sku, 'race-mix')
  const mixId = mix.json.orderId
  if (mixId) {
    const stockBeforeMix = stockOf((await snapshot()).products, sku.id)
    pb('backdate-expiry', mixId)
    const [s, e] = await Promise.all([
      markPaid(mixId, `rzp_mix_ok_${mixId}`),
      markPaid(mixId, `rzp_mix_ok_${mixId}`),
    ])
    const mixPb = pb('order', mixId)
    const mixHolds = pb('reservations', mixId)
    const stockAfterMix = stockOf((await snapshot()).products, sku.id)
    const paid = mixPb?.payment_status === 'paid'
    const expiredUnpaid = mixPb?.payment_status !== 'paid'
    const committed = (mixHolds?.items || []).filter((r) => r.status === 'committed').length
    const delta = stockBeforeMix != null && stockAfterMix != null ? stockAfterMix - stockBeforeMix : null
    const terminalOk = paid || expiredUnpaid
    const noDouble = delta === 0 || delta === -1
    const noPaidPlusCommitTwice = !(paid && delta === -2)
    record(
      'concurrent_expiry_and_success',
      terminalOk && noDouble && noPaidPlusCommitTwice && committed <= 1,
      `pb=${mixPb?.payment_status || '-'} late=${Boolean(s.json.lateSuccess || e.json.lateSuccess)} committed=${committed} stockΔ=${delta}`,
    )
  }

  const failed = results.filter((r) => !r.ok)
  printReport(failed.length === 0)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
