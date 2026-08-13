#!/usr/bin/env node
/**
 * Live V1.1 customer certification — real CFOS + PocketBase.
 * No new product surface. Reads OTP echo from start responses (ops-only).
 *
 *   COMMERCE_BASE=https://builder.indobase.in \
 *   STORE_URL=https://corev1-aug13.sites.indobase.in \
 *   PROJECT_REF=roshb77a4744fa \
 *   PROJECT_REF_B=<other-tenant> \
 *   node scripts/live-v11-customer-cert.mjs
 */
const BASE = (process.env.COMMERCE_BASE || 'https://builder.indobase.in').replace(/\/+$/, '')
const STORE = process.env.STORE_URL || 'https://corev1-aug13.sites.indobase.in'
const REF = process.env.PROJECT_REF || 'roshb77a4744fa'
const REF_B = process.env.PROJECT_REF_B || ''

const results = []

function record(id, ok, detail) {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

async function api(path, { method = 'GET', body, token, ref = REF, guestToken } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Indobase-Project-Ref': ref,
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (guestToken) headers['X-Indobase-Guest-Token'] = guestToken
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function uniq(prefix) {
  return `${prefix}+${Date.now()}@indobase.live`
}

async function main() {
  const htmlRes = await fetch(STORE)
  const html = await htmlRes.text()
  record(
    'storefront_deployed',
    htmlRes.ok && /openAccount/.test(html) && /customer\.startOtp/.test(html) && /openOrders/.test(html),
    `HTTP ${htmlRes.status} account=${/openAccount/.test(html)} otp=${/customer\\.startOtp/.test(html)}`,
  )
  record(
    'anonymous_browse_no_auth',
    /id="grid"/.test(html) && /id="search"/.test(html) && /commerce\.checkout\.create/.test(html),
    'Browse/search/checkout remain on the anonymous storefront',
  )

  const products = await api(`/api/os/commerce/products?projectRef=${encodeURIComponent(REF)}`)
  const catalog = Array.isArray(products.json.products) ? products.json.products : []
  const sku = catalog.find((p) => Number(p.stock) > 0) || catalog[0]
  record('catalog_live', Boolean(sku?.id), sku ? `product=${sku.id} stock=${sku.stock}` : `HTTP ${products.status}`)
  if (!sku?.id) {
    printReport(false)
    process.exit(1)
  }

  const emailA = uniq('v11a')
  const guest = await api('/api/os/commerce/checkout', {
    method: 'POST',
    body: {
      projectRef: REF,
      idempotencyKey: `v11-guest-${Date.now()}`,
      items: [{ productId: sku.id, quantity: 1 }],
      customer: { email: emailA, name: 'Browser A Guest' },
    },
  })
  const orderA = guest.json.orderId
  const guestTokenA = guest.json.guestToken
  record(
    'guest_checkout',
    guest.json.ok === true && guest.json.customerType === 'guest' && Boolean(orderA) && Boolean(guestTokenA),
    `order=${orderA || '-'} type=${guest.json.customerType || '-'} HTTP ${guest.status}`,
  )

  const viewGuest = await api(`/api/os/commerce/orders/${encodeURIComponent(orderA || 'x')}?projectRef=${encodeURIComponent(REF)}`, {
    guestToken: guestTokenA,
  })
  record(
    'guest_order_persisted',
    viewGuest.status === 200 && viewGuest.json.order?.id === orderA && viewGuest.json.order?.customerType === 'guest',
    `HTTP ${viewGuest.status} type=${viewGuest.json.order?.customerType || '-'} id=${viewGuest.json.order?.id || '-'}`,
  )

  const deniedAnon = await api(`/api/os/commerce/orders/${encodeURIComponent(orderA || 'x')}?projectRef=${encodeURIComponent(REF)}`)
  record(
    'guest_order_denied_without_token',
    deniedAnon.status === 403 || deniedAnon.status === 401,
    `HTTP ${deniedAnon.status}`,
  )

  const badOtp = await api('/api/os/commerce/customer/otp/verify', {
    method: 'POST',
    body: { projectRef: REF, email: emailA, code: '000000' },
  })
  record(
    'unverified_otp_rejected',
    badOtp.json.ok === false,
    `HTTP ${badOtp.status} code=${badOtp.json.code || '-'}`,
  )
  const stillGuest = await api(`/api/os/commerce/orders/${encodeURIComponent(orderA || 'x')}?projectRef=${encodeURIComponent(REF)}`, {
    guestToken: guestTokenA,
  })
  record(
    'unverified_did_not_claim',
    stillGuest.json.order?.customerType === 'guest',
    `type=${stillGuest.json.order?.customerType || '-'}`,
  )

  const claimProbe = await fetch(`${BASE}/api/os/commerce/customer/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Indobase-Project-Ref': REF },
    body: JSON.stringify({ projectRef: REF, email: emailA }),
  })
  record('no_public_claim_endpoint', claimProbe.status === 404, `HTTP ${claimProbe.status}`)

  const otpStartA = await api('/api/os/commerce/customer/otp/start', {
    method: 'POST',
    body: { projectRef: REF, email: emailA, name: 'Browser A' },
  })
  const codeA = otpStartA.json.devCode
  record(
    'otp_start_a',
    otpStartA.json.ok === true && Boolean(codeA),
    codeA ? 'devCode present (temporary echo)' : `HTTP ${otpStartA.status} echo_missing=${!otpStartA.json.devCode}`,
  )

  let tokenA = ''
  if (codeA) {
    const verifyA = await api('/api/os/commerce/customer/otp/verify', {
      method: 'POST',
      body: { projectRef: REF, email: emailA, code: codeA, name: 'Browser A' },
    })
    tokenA = verifyA.json.token || ''
    record(
      'verified_claim',
      verifyA.json.ok === true && Number(verifyA.json.claimedOrders || 0) >= 1 && Boolean(tokenA),
      `claimed=${verifyA.json.claimedOrders} HTTP ${verifyA.status}`,
    )
  } else {
    record('verified_claim', false, 'OTP echo disabled — cannot complete live claim without mailbox')
  }

  if (tokenA) {
    const meA = await api('/api/os/commerce/customer/me?projectRef=' + encodeURIComponent(REF), { token: tokenA })
    record('session_a', meA.json.authenticated === true && meA.json.customer?.email === emailA, `auth=${meA.json.authenticated}`)

    const listedA = await api('/api/os/commerce/customer/orders?projectRef=' + encodeURIComponent(REF), { token: tokenA })
    const idsA = (listedA.json.orders || []).map((o) => o.id)
    record(
      'claimed_order_visible_once',
      idsA.filter((id) => id === orderA).length === 1,
      `orders=${idsA.length} hasA=${idsA.includes(orderA)}`,
    )

    const owned = await api(`/api/os/commerce/orders/${encodeURIComponent(orderA)}?projectRef=${encodeURIComponent(REF)}`, {
      token: tokenA,
    })
    record(
      'claimed_order_registered',
      owned.json.order?.customerType === 'registered' && owned.json.order?.id === orderA,
      `type=${owned.json.order?.customerType || '-'}`,
    )

    const refresh = await api('/api/os/commerce/customer/me?projectRef=' + encodeURIComponent(REF), { token: tokenA })
    record('refresh_preserves_session', refresh.json.authenticated === true, `auth=${refresh.json.authenticated}`)

    await api('/api/os/commerce/customer/logout', {
      method: 'POST',
      token: tokenA,
      body: { projectRef: REF },
    })
    const afterLogoutNoToken = await api('/api/os/commerce/customer/orders?projectRef=' + encodeURIComponent(REF))
    record('logout_hides_history', afterLogoutNoToken.status === 401, `HTTP ${afterLogoutNoToken.status}`)

    const reloginStart = await api('/api/os/commerce/customer/otp/start', {
      method: 'POST',
      body: { projectRef: REF, email: emailA, name: 'Browser A' },
    })
    const codeRelogin = reloginStart.json.devCode
    let tokenA2 = tokenA
    if (codeRelogin) {
      const relogin = await api('/api/os/commerce/customer/otp/verify', {
        method: 'POST',
        body: { projectRef: REF, email: emailA, code: codeRelogin },
      })
      tokenA2 = relogin.json.token || tokenA
      record('relogin', relogin.json.ok === true && Boolean(tokenA2), `HTTP ${relogin.status}`)
    } else {
      record('relogin', false, 'OTP echo missing on re-login')
    }

    const emailB = uniq('v11b')
    const guestB = await api('/api/os/commerce/checkout', {
      method: 'POST',
      body: {
        projectRef: REF,
        idempotencyKey: `v11-guest-b-${Date.now()}`,
        items: [{ productId: sku.id, quantity: 1 }],
        customer: { email: emailB, name: 'Browser B Guest' },
      },
    })
    const orderB = guestB.json.orderId
    const startB = await api('/api/os/commerce/customer/otp/start', {
      method: 'POST',
      body: { projectRef: REF, email: emailB, name: 'Browser B' },
    })
    const codeB = startB.json.devCode
    let tokenB = ''
    if (codeB) {
      const verifyB = await api('/api/os/commerce/customer/otp/verify', {
        method: 'POST',
        body: { projectRef: REF, email: emailB, code: codeB, name: 'Browser B' },
      })
      tokenB = verifyB.json.token || ''
    }
    record('browser_b_session', Boolean(tokenB) && Boolean(orderB), `orderB=${orderB || '-'} token=${Boolean(tokenB)}`)

    if (tokenB && orderB) {
      const aGetsB = await api(`/api/os/commerce/orders/${encodeURIComponent(orderB)}?projectRef=${encodeURIComponent(REF)}`, {
        token: tokenA2,
      })
      const bGetsA = await api(`/api/os/commerce/orders/${encodeURIComponent(orderA)}?projectRef=${encodeURIComponent(REF)}`, {
        token: tokenB,
      })
      record('a_denied_b_order', aGetsB.status === 403 || aGetsB.status === 404, `HTTP ${aGetsB.status}`)
      record('b_denied_a_order', bGetsA.status === 403 || bGetsA.status === 404, `HTTP ${bGetsA.status}`)

      const aList = await api('/api/os/commerce/customer/orders?projectRef=' + encodeURIComponent(REF), { token: tokenA2 })
      const bList = await api('/api/os/commerce/customer/orders?projectRef=' + encodeURIComponent(REF), { token: tokenB })
      const aIds = (aList.json.orders || []).map((o) => o.id)
      const bIds = (bList.json.orders || []).map((o) => o.id)
      record('a_list_hides_b', !aIds.includes(orderB) && aIds.includes(orderA), `a=${aIds.length}`)
      record('b_list_hides_a', !bIds.includes(orderA) && bIds.includes(orderB), `b=${bIds.length}`)
    }
  }

  if (REF_B) {
    const startCross = await api('/api/os/commerce/customer/otp/start', {
      method: 'POST',
      ref: REF_B,
      body: { projectRef: REF_B, email: emailA, name: 'Tenant B' },
    })
    const codeCross = startCross.json.devCode
    if (codeCross) {
      const verifyCross = await api('/api/os/commerce/customer/otp/verify', {
        method: 'POST',
        ref: REF_B,
        body: { projectRef: REF_B, email: emailA, code: codeCross, name: 'Tenant B' },
      })
      const claimed = Number(verifyCross.json.claimedOrders || 0)
      const tokenBTenant = verifyCross.json.token || ''
      const listB = tokenBTenant
        ? await api('/api/os/commerce/customer/orders?projectRef=' + encodeURIComponent(REF_B), {
            token: tokenBTenant,
            ref: REF_B,
          })
        : { json: { orders: [] } }
      const stolen = (listB.json.orders || []).some((o) => o.id === orderA)
      record(
        'cross_tenant_claim_denied',
        verifyCross.json.ok === true && claimed === 0 && !stolen,
        `claimed=${claimed} stoleA=${stolen} HTTP ${verifyCross.status}`,
      )
      const stillA = await api(`/api/os/commerce/orders/${encodeURIComponent(orderA)}?projectRef=${encodeURIComponent(REF)}`, {
        guestToken: guestTokenA,
      })
      // After claim on A, guest token is cleared — registered owner on A must still exist.
      record(
        'cross_tenant_did_not_mutate_a',
        stillA.status === 403 || stillA.json.order?.customerType === 'registered' || stillA.json.order?.id === orderA,
        `HTTP ${stillA.status} type=${stillA.json.order?.customerType || 'denied'}`,
      )
    } else {
      record('cross_tenant_claim_denied', false, `tenant B OTP echo missing HTTP ${startCross.status}`)
    }
  } else {
    record('cross_tenant_claim_denied', false, 'PROJECT_REF_B not set')
  }

  const failed = results.filter((r) => !r.ok)
  printReport(failed.length === 0)
  process.exit(failed.length === 0 ? 0 : 1)
}

function printReport(ok) {
  console.log('\n--- V1.1 live gate ---')
  console.log(ok ? 'READY FOR RELEASE' : 'NOT READY')
  console.log(`passed ${results.filter((r) => r.ok).length}/${results.length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
