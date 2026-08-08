/**
 * OS shop catalog — tenant-DB products + inventory + atomic place_order.
 * Closes the Naïve-parity gap: real backend catalog (not Payments billing products).
 */

import type { JwtPayload } from '@indobaseinc/indobase-js'

import { buildBuilderBackendConfig, getStudioOrigin } from './builder-launch'
import { getDatabaseOperations } from './mcp'
import { ensureOsCapability } from './os-ensurer'
import type { Claims } from './platform'
import { getProjectSettingsForRef } from './settings'

type ClaimsLike = JwtPayload & Record<string, unknown>

export type ShopProductInput = {
  slug: string
  name: string
  description?: string | null
  /** Major units as decimal string, e.g. "480" or "19.99" */
  price: string
  currency?: string | null
  stock?: number | null
  image_url?: string | null
  active?: boolean | null
}

export type ShopProductRow = {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  stock: number
  image_url: string | null
  active: boolean
}

export type ShopOrderRow = {
  id: string
  order_number: string
  email: string
  status: string
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  currency: string
  created_at: string
}

export type ShopCatalogResult = {
  ok: boolean
  message: string
  code?: string
  products?: ShopProductRow[]
  orders?: ShopOrderRow[]
  order?: ShopOrderRow
  admin_html?: string
  catalog_json?: ShopProductRow[]
}

function priceToCents(price: string): number | null {
  const n = Number(String(price).trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

const DDL_STATEMENTS = [
  `create table if not exists public.shop_products (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    description text,
    price_cents integer not null check (price_cents >= 0),
    currency text not null default 'INR',
    stock integer not null default 0 check (stock >= 0),
    image_url text,
    active boolean not null default true,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists public.shop_orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null unique,
    email text not null,
    status text not null default 'pending',
    subtotal_cents integer not null,
    shipping_cents integer not null default 0,
    total_cents integer not null,
    currency text not null default 'INR',
    checkout_url text,
    payments_session_id text,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists public.shop_order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.shop_orders(id) on delete cascade,
    product_id uuid not null references public.shop_products(id),
    quantity integer not null check (quantity > 0),
    unit_price_cents integer not null,
    line_total_cents integer not null
  )`,
  `create or replace function public.shop_place_order(
    p_email text,
    p_items jsonb,
    p_free_shipping_over_cents integer default 15000,
    p_shipping_cents integer default 1500
  ) returns public.shop_orders
  language plpgsql
  as $$
  declare
    v_item jsonb;
    v_product public.shop_products%rowtype;
    v_qty integer;
    v_subtotal integer := 0;
    v_shipping integer := 0;
    v_order public.shop_orders%rowtype;
    v_order_number text;
    v_currency text := 'INR';
  begin
    if p_email is null or length(trim(p_email)) = 0 or position('@' in p_email) = 0 then
      raise exception 'valid email required';
    end if;
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'items required';
    end if;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      select * into v_product
      from public.shop_products
      where id = (v_item->>'product_id')::uuid
         or slug = coalesce(v_item->>'slug', '')
      for update;

      if not found or v_product.active is not true then
        raise exception 'product not found or inactive';
      end if;

      v_qty := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
      if v_product.stock < v_qty then
        raise exception 'insufficient stock for %', v_product.slug;
      end if;

      update public.shop_products
      set stock = stock - v_qty
      where id = v_product.id;

      v_subtotal := v_subtotal + (v_product.price_cents * v_qty);
      v_currency := v_product.currency;
    end loop;

    if v_subtotal >= coalesce(p_free_shipping_over_cents, 15000) then
      v_shipping := 0;
    else
      v_shipping := coalesce(p_shipping_cents, 1500);
    end if;

    v_order_number := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.shop_orders (
      order_number, email, status, subtotal_cents, shipping_cents, total_cents, currency
    ) values (
      v_order_number, trim(p_email), 'confirmed', v_subtotal, v_shipping,
      v_subtotal + v_shipping, v_currency
    ) returning * into v_order;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      select * into v_product
      from public.shop_products
      where id = (v_item->>'product_id')::uuid
         or slug = coalesce(v_item->>'slug', '');

      v_qty := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

      insert into public.shop_order_items (
        order_id, product_id, quantity, unit_price_cents, line_total_cents
      ) values (
        v_order.id, v_product.id, v_qty, v_product.price_cents, v_product.price_cents * v_qty
      );
    end loop;

    return v_order;
  end;
  $$`,
  `grant usage on schema public to anon, authenticated, service_role`,
  `grant select on public.shop_products to anon, authenticated`,
  // Merchant admin.html may refresh orders live via anon REST (protect the URL in production).
  `grant select on public.shop_orders to anon, authenticated`,
  `grant select on public.shop_order_items to authenticated`,
  `grant execute on function public.shop_place_order(text, jsonb, integer, integer) to service_role, authenticated`,
]

async function tenantDb(claims: ClaimsLike, ref: string) {
  return getDatabaseOperations({ claims, projectRef: ref })
}

async function ensureSchema(claims: ClaimsLike, ref: string): Promise<{ ok: boolean; message?: string; code?: string }> {
  // Ensure dedicated DB exists (businessData / database capability).
  const ensured = await ensureOsCapability({
    claims: claims as Claims,
    workspaceRef: ref,
    capability: 'businessData',
  })
  if (!ensured.ok && ensured.status !== 'enabled') {
    return {
      ok: false,
      code: 'database_required',
      message:
        ensured.message ||
        'Customer database not ready — Enable database (businessData) first, then retry setupShopCatalog',
    }
  }

  const db = await tenantDb(claims, ref)
  for (const statement of DDL_STATEMENTS) {
    try {
      await db.executeSql(ref, { query: statement })
    } catch (err) {
      return {
        ok: false,
        code: 'schema_failed',
        message: err instanceof Error ? err.message : 'Failed to create shop schema',
      }
    }
  }
  return { ok: true }
}

export function buildShopAdminHtml(opts: {
  brand?: string
  products: ShopProductRow[]
  orders: ShopOrderRow[]
  /** When set, admin.html refreshes live from project REST (no republish). */
  restUrl?: string | null
  anonKey?: string | null
}): string {
  const brand = (opts.brand || 'Shop').replace(/[<>&"]/g, '')
  const productsJson = JSON.stringify(opts.products)
  const ordersJson = JSON.stringify(opts.orders)
  const restUrl = (opts.restUrl || '').replace(/\/+$/, '')
  const anonKey = (opts.anonKey || '').replace(/[<>"\\]/g, '')
  const live = Boolean(restUrl && anonKey)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand} — Admin</title>
<style>
  :root { color-scheme: light; --ink:#111; --muted:#666; --line:#e5e5e5; --bg:#fafafa; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.45 system-ui,sans-serif; color:var(--ink); background:var(--bg); }
  header { padding:20px 24px; border-bottom:1px solid var(--line); background:#fff; display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
  h1 { margin:0; font-size:18px; font-weight:650; }
  p { margin:4px 0 0; color:var(--muted); }
  button { border:1px solid var(--line); background:#fff; padding:8px 12px; cursor:pointer; font:inherit; }
  main { padding:24px; display:grid; gap:24px; max-width:1100px; margin:0 auto; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; }
  .stat { background:#fff; border:1px solid var(--line); padding:14px 16px; }
  .stat b { display:block; font-size:20px; }
  .stat span { color:var(--muted); font-size:12px; }
  section { background:#fff; border:1px solid var(--line); padding:16px; }
  h2 { margin:0 0 12px; font-size:15px; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:550; font-size:12px; }
  .low { color:#b45309; }
  .out { color:#b91c1c; }
  #status { font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<header>
  <div>
    <h1>${brand} — Admin</h1>
    <p>${live ? 'Live data from your Indobase project REST API (auto-refresh every 5s). Protect this URL.' : 'Snapshot fallback — publish again after setupShopCatalog with project REST bindings for live refresh.'}</p>
    <p id="status"></p>
  </div>
  <button type="button" id="refresh">Refresh now</button>
</header>
<main>
  <div class="stats" id="stats"></div>
  <section>
    <h2>Inventory</h2>
    <table>
      <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
      <tbody id="products"></tbody>
    </table>
  </section>
  <section>
    <h2>Orders</h2>
    <table>
      <thead><tr><th>Order</th><th>Email</th><th>Total</th><th>Status</th><th>When</th></tr></thead>
      <tbody id="orders"></tbody>
    </table>
  </section>
</main>
<script>
const REST = ${JSON.stringify(restUrl)};
const ANON = ${JSON.stringify(anonKey)};
let products = ${productsJson};
let orders = ${ordersJson};
const money = (cents, currency) => new Intl.NumberFormat(undefined, { style:'currency', currency: currency || 'INR' }).format((cents||0)/100);
function render() {
  const units = products.reduce((n,p)=>n+(p.stock||0),0);
  const low = products.filter(p => p.active && p.stock > 0 && p.stock < 5).length;
  const catalogValue = products.reduce((n,p)=>n+(p.price_cents||0)*(p.stock||0),0);
  document.getElementById('stats').innerHTML = [
    ['Products', products.filter(p=>p.active).length],
    ['Units in stock', units],
    ['Low stock', low],
    ['Orders', orders.length],
    ['Catalog value', money(catalogValue, products[0]?.currency || 'INR')],
  ].map(([k,v]) => '<div class="stat"><b>'+v+'</b><span>'+k+'</span></div>').join('');
  document.getElementById('products').innerHTML = products.map(p => {
    const st = !p.active ? 'inactive' : p.stock <= 0 ? 'out of stock' : p.stock < 5 ? 'low stock' : 'in stock';
    const cls = st.includes('out') ? 'out' : st.includes('low') ? 'low' : '';
    const thumb = p.image_url ? '<br/><img src="'+p.image_url+'" alt="" style="max-height:40px;margin-top:4px"/>' : '';
    return '<tr><td><strong>'+p.name+'</strong><br/><span style="color:#666">'+p.slug+'</span>'+thumb+'</td><td>'+money(p.price_cents,p.currency)+'</td><td>'+p.stock+'</td><td class="'+cls+'">'+st+'</td></tr>';
  }).join('') || '<tr><td colspan="4">No products</td></tr>';
  document.getElementById('orders').innerHTML = orders.map(o =>
    '<tr><td>'+o.order_number+'</td><td>'+(o.email||'')+'</td><td>'+money(o.total_cents,o.currency)+'</td><td>'+o.status+'</td><td>'+o.created_at+'</td></tr>'
  ).join('') || '<tr><td colspan="5">No orders yet</td></tr>';
}
async function refresh() {
  if (!REST || !ANON) { render(); document.getElementById('status').textContent = 'Snapshot mode'; return; }
  const headers = { apikey: ANON, Authorization: 'Bearer ' + ANON, Accept: 'application/json' };
  try {
    const [pRes, oRes] = await Promise.all([
      fetch(REST + '/shop_products?select=id,slug,name,description,price_cents,currency,stock,image_url,active&order=created_at.asc', { headers }),
      fetch(REST + '/shop_orders?select=id,order_number,email,status,subtotal_cents,shipping_cents,total_cents,currency,created_at&order=created_at.desc&limit=50', { headers }),
    ]);
    if (pRes.ok) products = await pRes.json();
    if (oRes.ok) orders = await oRes.json();
    document.getElementById('status').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('status').textContent = 'Live refresh failed — showing last data';
  }
  render();
}
document.getElementById('refresh').onclick = () => refresh();
refresh();
${live ? 'setInterval(refresh, 5000);' : ''}
</script>
</body>
</html>`
}

export async function setupShopCatalog({
  claims,
  ref,
  products,
  brand,
}: {
  claims: ClaimsLike
  ref: string
  products?: ShopProductInput[] | null
  brand?: string | null
}): Promise<ShopCatalogResult> {
  const schema = await ensureSchema(claims, ref)
  if (!schema.ok) {
    return { ok: false, message: schema.message || 'Schema failed', code: schema.code }
  }

  const db = await tenantDb(claims, ref)
  const inputs = Array.isArray(products) ? products : []

  for (const raw of inputs) {
    const name = (raw.name || '').trim()
    const slug = slugify(raw.slug || name)
    const cents = priceToCents(String(raw.price ?? ''))
    if (!name || !slug || cents === null) {
      return {
        ok: false,
        code: 'invalid_product',
        message: 'Each product needs name, slug (or name), and price (e.g. "999")',
      }
    }
    const currency = (raw.currency || 'INR').trim().toUpperCase() || 'INR'
    const stock = typeof raw.stock === 'number' && raw.stock >= 0 ? Math.floor(raw.stock) : 0
    const imageUrl = (raw.image_url || '').trim() || null
    const active = raw.active === false ? false : true
    const description = (raw.description || '').trim() || null

    await db.executeSql(ref, {
      query: `
        insert into public.shop_products (slug, name, description, price_cents, currency, stock, image_url, active)
        values ($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (slug) do update set
          name = excluded.name,
          description = excluded.description,
          price_cents = excluded.price_cents,
          currency = excluded.currency,
          stock = excluded.stock,
          image_url = excluded.image_url,
          active = excluded.active
      `,
      parameters: [slug, name, description, cents, currency, stock, imageUrl, active],
    })
  }

  const listed = await listShopCatalog({ claims, ref, brand })
  return {
    ...listed,
    message:
      inputs.length > 0
        ? `Shop catalog ready — ${listed.products?.length ?? 0} products. Wire Buy CTAs with wireCheckout (mode one_time) or call placeTestShopOrder to prove inventory.`
        : listed.message,
  }
}

async function resolveRestBindings(
  claims: ClaimsLike,
  ref: string
): Promise<{ restUrl?: string; anonKey?: string }> {
  try {
    const settings = await getProjectSettingsForRef({ claims: claims as Claims, ref })
    if (!settings) return {}
    const backend = buildBuilderBackendConfig({
      projectName: ref,
      projectRef: ref,
      settings,
      studioUrl: getStudioOrigin() || 'https://studio.indobase.in',
    })
    return {
      restUrl: backend.rest_url || undefined,
      anonKey: backend.anon_key || undefined,
    }
  } catch {
    return {}
  }
}

export async function listShopCatalog({
  claims,
  ref,
  brand,
}: {
  claims: ClaimsLike
  ref: string
  brand?: string | null
}): Promise<ShopCatalogResult> {
  const schema = await ensureSchema(claims, ref)
  if (!schema.ok) {
    return { ok: false, message: schema.message || 'Schema failed', code: schema.code }
  }

  const db = await tenantDb(claims, ref)
  const products = await db.executeSql<ShopProductRow>(ref, {
    query: `
      select id::text, slug, name, description, price_cents, currency, stock, image_url, active
      from public.shop_products
      order by created_at asc
    `,
  })
  const orders = await db.executeSql<ShopOrderRow>(ref, {
    query: `
      select id::text, order_number, email, status, subtotal_cents, shipping_cents, total_cents, currency,
             created_at::text
      from public.shop_orders
      order by created_at desc
      limit 50
    `,
  })

  const productRows = products || []
  const orderRows = orders || []
  const bindings = await resolveRestBindings(claims, ref)

  return {
    ok: true,
    message: bindings.restUrl
      ? `Catalog: ${productRows.length} products, ${orderRows.length} recent orders (admin_html live-refreshes via project REST)`
      : `Catalog: ${productRows.length} products, ${orderRows.length} recent orders`,
    products: productRows,
    orders: orderRows,
    catalog_json: productRows,
    admin_html: buildShopAdminHtml({
      brand: brand || undefined,
      products: productRows,
      orders: orderRows,
      restUrl: bindings.restUrl,
      anonKey: bindings.anonKey,
    }),
  }
}

export async function placeTestShopOrder({
  claims,
  ref,
  email,
  items,
  cleanup,
  brand,
}: {
  claims: ClaimsLike
  ref: string
  email: string
  items: Array<{ product_id?: string; slug?: string; quantity?: number }>
  cleanup?: boolean
  brand?: string | null
}): Promise<ShopCatalogResult> {
  const schema = await ensureSchema(claims, ref)
  if (!schema.ok) {
    return { ok: false, message: schema.message || 'Schema failed', code: schema.code }
  }

  if (!email?.includes('@') || !Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      code: 'invalid_order',
      message: 'email and items[{product_id|slug, quantity}] required',
    }
  }

  const db = await tenantDb(claims, ref)
  const payload = items.map((i) => ({
    product_id: i.product_id || null,
    slug: i.slug || null,
    quantity: typeof i.quantity === 'number' && i.quantity > 0 ? Math.floor(i.quantity) : 1,
  }))

  try {
    const rows = await db.executeSql<ShopOrderRow>(ref, {
      query: `
        select id::text, order_number, email, status, subtotal_cents, shipping_cents, total_cents, currency,
               created_at::text
        from public.shop_place_order($1, $2::jsonb)
      `,
      parameters: [email.trim(), JSON.stringify(payload)],
    })
    const order = rows?.[0]
    if (!order) {
      return { ok: false, code: 'order_failed', message: 'place_order returned no row' }
    }

    if (cleanup) {
      // Restore stock by reversing quantities, then delete test order.
      await db.executeSql(ref, {
        query: `
          with lines as (
            select product_id, quantity from public.shop_order_items where order_id = $1::uuid
          )
          update public.shop_products p
          set stock = p.stock + l.quantity
          from lines l
          where p.id = l.product_id
        `,
        parameters: [order.id],
      })
      await db.executeSql(ref, {
        query: `delete from public.shop_orders where id = $1::uuid`,
        parameters: [order.id],
      })
    }

    const listed = await listShopCatalog({ claims, ref, brand })
    return {
      ok: true,
      message: cleanup
        ? `Test order ${order.order_number} verified (stock decremented then restored). Catalog is pristine.`
        : `Order ${order.order_number} confirmed — total ${(order.total_cents / 100).toFixed(2)} ${order.currency}`,
      order: cleanup ? undefined : order,
      products: listed.products,
      orders: listed.orders,
      admin_html: listed.admin_html,
      catalog_json: listed.catalog_json,
    }
  } catch (err) {
    return {
      ok: false,
      code: 'order_failed',
      message: err instanceof Error ? err.message : 'place_order failed',
    }
  }
}

/** Exported for unit tests */
export const __shopCatalogTest = { priceToCents, slugify, DDL_STATEMENTS, buildShopAdminHtml }
