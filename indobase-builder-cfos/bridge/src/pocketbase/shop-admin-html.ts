import { buildManagedPublicEnv } from './managed.js'

export type ManagedShopAdminRow = Record<string, unknown>

/** Live-refresh admin shell for managed PocketBase ecommerce (products + orders). */
export function buildManagedShopAdminHtml(opts: {
  brand?: string
  appId: string
  publicUrl: string
  products?: ManagedShopAdminRow[]
  orders?: ManagedShopAdminRow[]
}): string {
  const brand = (opts.brand || 'Shop').replace(/[<>&"]/g, '')
  const env = buildManagedPublicEnv({ publicUrl: opts.publicUrl, appId: opts.appId })
  const productsJson = JSON.stringify(opts.products || [])
  const ordersJson = JSON.stringify(opts.orders || [])

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand} — Admin</title>
<style>
  :root { color-scheme: light; --ink:#111; --muted:#666; --line:#e5e5e5; --bg:#fafafa; --accent:#3B8FD6; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.45 system-ui,sans-serif; color:var(--ink); background:var(--bg); }
  header { padding:20px 24px; border-bottom:1px solid var(--line); background:#fff; display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
  h1 { margin:0; font-size:18px; font-weight:650; }
  p { margin:4px 0 0; color:var(--muted); }
  .pill { font-size:12px; padding:4px 10px; border-radius:999px; background:#ecfdf5; color:#047857; border:1px solid #bbf7d0; }
  main { padding:24px; display:grid; gap:24px; max-width:1100px; margin:0 auto; }
  .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; }
  .metric { background:#fff; border:1px solid var(--line); padding:14px 16px; }
  .metric label { display:block; color:var(--muted); font-size:12px; margin-bottom:4px; }
  .metric strong { font-size:20px; }
  .metric small { display:block; color:var(--muted); font-size:11px; margin-top:2px; }
  section { background:#fff; border:1px solid var(--line); padding:16px; }
  h2 { margin:0 0 12px; font-size:15px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
  h2 a { font-size:12px; color:var(--accent); text-decoration:none; font-weight:500; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:550; font-size:12px; text-transform:uppercase; letter-spacing:.03em; }
  .muted { color:var(--muted); font-size:12px; }
  .status { font-size:12px; padding:2px 8px; border-radius:999px; background:#f3f4f6; }
  .status.test, .status.pending { background:#fef3c7; color:#92400e; }
  .status.paid, .status.completed { background:#ecfdf5; color:#047857; }
  #status { font-size:12px; color:var(--muted); margin-top:8px; }
  .banner { background:#ecfdf5; border:1px solid #bbf7d0; color:#065f46; padding:10px 12px; border-radius:8px; font-size:13px; }
  .err { color:#b91c1c; font-size:13px; }
</style>
<script>window.__INDOBASE_ENV__=${JSON.stringify(env)};window.__INDOBASE_COLLECTION__=function(n){var p=(window.__INDOBASE_ENV__||{}).INDOBASE_COLLECTION_PREFIX||'';return p+String(n||'').toLowerCase().replace(/[^a-z0-9_]/g,'_');};window.__INDOBASE_CONFIG__={baseUrl:${JSON.stringify(env.INDOBASE_RECORDS_BASE||'')},prefix:${JSON.stringify(env.INDOBASE_COLLECTION_PREFIX||'')},collections:{products:window.__INDOBASE_COLLECTION__('products'),orders:window.__INDOBASE_COLLECTION__('orders'),orderItems:window.__INDOBASE_COLLECTION__('order_items')}};</script>
</head>
<body>
<header>
  <div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <h1>${brand}</h1>
      <span class="pill">Admin console</span>
    </div>
    <p>Store overview — inventory refreshes live from your Indobase backend.</p>
    <p id="status"></p>
  </div>
  <div class="pill">backend connected</div>
</header>
<main>
  <p class="banner">Customer login is enabled. Payment processing still requires Razorpay or Stripe gateway credentials.</p>
  <div class="metrics" id="metrics"></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">
    <section>
      <h2>Inventory <a href="#">Live catalog</a></h2>
      <table id="products"><thead><tr><th>Product</th><th>Price</th><th>Stock</th></tr></thead><tbody></tbody></table>
    </section>
    <section>
      <h2>Orders <a href="#">Recent activity</a></h2>
      <table id="orders"><thead><tr><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody></tbody></table>
    </section>
  </div>
  <p class="err" id="error" hidden></p>
</main>
<script>
const API=(window.__INDOBASE_ENV__||{}).INDOBASE_RECORDS_BASE||'';
let products=${productsJson};
let orders=${ordersJson};
const money=(v,c)=>{const n=Number(v||0);const cur=c||'INR';try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:cur}).format(n)}catch(e){return '₹'+n.toLocaleString('en-IN')}};
function pbItems(payload){if(Array.isArray(payload))return payload;if(payload&&Array.isArray(payload.items))return payload.items;if(payload&&Array.isArray(payload.records))return payload.records.map(x=>x.record||x);return []}
function render(){
  document.querySelector('#metrics').innerHTML=[
    ['Products',products.length,'Catalog records'],
    ['Inventory units',products.reduce((s,p)=>s+Number(p.stock||0),0),'Across active products'],
    ['Orders',orders.length,'Stored orders'],
    ['Revenue',money(orders.reduce((s,o)=>s+Number(o.total||0),0),orders[0]&&orders[0].currency||'INR'),'Recorded totals'],
  ].map(x=>'<div class="metric"><label>'+x[0]+'</label><strong>'+x[1]+'</strong><small>'+x[2]+'</small></div>').join('');
  document.querySelector('#products tbody').innerHTML=products.length?products.map(p=>'<tr><td><b>'+(p.name||'')+'</b><div class="muted">'+(p.slug||'')+'</div></td><td>'+money(p.price,p.currency)+'</td><td>'+Number(p.stock||0)+'</td></tr>').join(''):'<tr><td colspan="3" class="muted">No products yet.</td></tr>';
  document.querySelector('#orders tbody').innerHTML=orders.length?orders.slice(0,20).map(o=>'<tr><td><b>'+(o.email||o.customer_name||'Guest')+'</b><div class="muted">'+(o.id||'')+'</div></td><td>'+money(o.total,o.currency)+'</td><td><span class="status '+(o.status||'')+'">'+String(o.status||'pending').replace(/_/g,' ')+'</span></td></tr>').join(''):'<tr><td colspan="3" class="muted">No orders yet.</td></tr>';
}
async function load(){
  const err=document.querySelector('#error');
  err.hidden=true;
  if(!API||!window.__INDOBASE_COLLECTION__){render();document.querySelector('#status').textContent='Snapshot mode';return}
  try{
    const productsCol=window.__INDOBASE_COLLECTION__('products');
    const ordersCol=window.__INDOBASE_COLLECTION__('orders');
    const [pr,or]=await Promise.all([
      fetch(API+'/'+productsCol+'/records?perPage=200&sort=-created'),
      fetch(API+'/'+ordersCol+'/records?perPage=50&sort=-created'),
    ]);
    const pj=await pr.json().catch(()=>({}));
    const oj=await or.json().catch(()=>({}));
    if(pr.ok){products=pbItems(pj)}
    if(or.ok){const live=pbItems(oj);if(live.length)orders=live}
    render();
    document.querySelector('#status').textContent='Updated '+new Date().toLocaleTimeString();
  }catch(e){
    render();
    err.hidden=false;
    err.textContent='Live refresh failed — showing last snapshot.';
  }
}
render();
load();
setInterval(load,5000);
</script>
</body>
</html>`
}
