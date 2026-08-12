import { buildManagedPublicEnv } from './managed.js'

export type ManagedShopStorefrontRow = Record<string, unknown>

/**
 * Functional storefront shell for managed PocketBase ecommerce.
 * Loads products from ib_{app}_products and POSTs orders to ib_{app}_orders.
 * Canonical fields: name, slug, price, currency, stock, image_url, email.
 */
export function buildManagedShopStorefrontHtml(opts: {
  brand?: string
  tagline?: string
  appId: string
  publicUrl: string
  products?: ManagedShopStorefrontRow[]
}): string {
  const brand = (opts.brand || 'Shop').replace(/[<>&"]/g, '')
  const tagline = (opts.tagline || 'Order online — live inventory from Indobase.').replace(/[<>&"]/g, '')
  const env = buildManagedPublicEnv({ publicUrl: opts.publicUrl, appId: opts.appId })
  const productsJson = JSON.stringify(opts.products || [])

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title>
<style>
  :root { color-scheme: light; --ink:#111; --muted:#5b5b5b; --line:#e8e8e8; --bg:#f7f7f5; --card:#fff; --accent:#3B8FD6; --accent-ink:#fff; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui,sans-serif; color:var(--ink); background:var(--bg); }
  header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 22px; background:var(--card); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:2; }
  .brand h1 { margin:0; font-size:1.25rem; font-weight:650; letter-spacing:-.02em; }
  .brand p { margin:2px 0 0; color:var(--muted); font-size:13px; }
  .cart-btn { border:1px solid var(--line); background:var(--card); padding:8px 14px; border-radius:999px; cursor:pointer; font:inherit; }
  main { max-width:1080px; margin:0 auto; padding:24px 18px 64px; }
  #status { color:var(--muted); font-size:13px; margin:0 0 16px; }
  #error { color:#b91c1c; font-size:13px; margin:0 0 12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
  .card img { width:100%; aspect-ratio:4/3; object-fit:cover; background:#eee; }
  .card .body { padding:14px; display:grid; gap:8px; flex:1; }
  .card h2 { margin:0; font-size:1rem; font-weight:600; }
  .meta { color:var(--muted); font-size:13px; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .price { font-weight:650; }
  button.add { border:0; background:var(--accent); color:var(--accent-ink); padding:8px 12px; border-radius:8px; cursor:pointer; font:inherit; font-weight:600; }
  button.add:disabled { opacity:.45; cursor:not-allowed; }
  dialog { border:1px solid var(--line); border-radius:14px; padding:0; max-width:420px; width:calc(100% - 32px); }
  dialog::backdrop { background:rgba(0,0,0,.35); }
  .dlg { padding:18px; display:grid; gap:12px; }
  .dlg h2 { margin:0; font-size:1.1rem; }
  .dlg ul { margin:0; padding:0; list-style:none; display:grid; gap:8px; }
  .dlg li { display:flex; justify-content:space-between; gap:8px; font-size:14px; }
  .dlg input, .dlg label { width:100%; }
  .dlg input { margin-top:4px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font:inherit; }
  .dlg .actions { display:flex; gap:8px; justify-content:flex-end; }
  .dlg .actions button { padding:9px 14px; border-radius:8px; border:1px solid var(--line); background:#fff; font:inherit; cursor:pointer; }
  .dlg .actions .primary { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; }
  .empty { color:var(--muted); padding:28px 8px; text-align:center; }
</style>
<script>window.__INDOBASE_ENV__=${JSON.stringify(env)};window.__INDOBASE_COLLECTION__=function(n){var p=(window.__INDOBASE_ENV__||{}).INDOBASE_COLLECTION_PREFIX||'';return p+String(n||'').toLowerCase().replace(/[^a-z0-9_]/g,'_');};window.__INDOBASE_CONFIG__={baseUrl:${JSON.stringify(env.INDOBASE_RECORDS_BASE||'')},prefix:${JSON.stringify(env.INDOBASE_COLLECTION_PREFIX||'')},collections:{products:window.__INDOBASE_COLLECTION__('products'),orders:window.__INDOBASE_COLLECTION__('orders'),orderItems:window.__INDOBASE_COLLECTION__('order_items')}};</script>
</head>
<body>
<header>
  <div class="brand">
    <h1>${brand}</h1>
    <p>${tagline}</p>
  </div>
  <button type="button" class="cart-btn" id="openCart">Cart (<span id="cartCount">0</span>)</button>
</header>
<main>
  <p id="status">Loading catalog…</p>
  <p id="error" hidden></p>
  <div class="grid" id="grid"></div>
</main>
<dialog id="cartDlg">
  <form method="dialog" class="dlg" id="checkoutForm">
    <h2>Your cart</h2>
    <ul id="cartList"></ul>
    <div class="row"><strong>Total</strong><strong id="cartTotal">₹0</strong></div>
    <label>Email<input required type="email" name="email" placeholder="you@example.com" autocomplete="email"/></label>
    <p class="meta" id="checkoutNote">Places a real order on your Indobase backend (pay later via Razorpay/Stripe).</p>
    <div class="actions">
      <button type="button" id="closeCart">Close</button>
      <button class="primary" type="submit" id="placeOrder">Place order</button>
    </div>
  </form>
</dialog>
<script>
const API=(window.__INDOBASE_ENV__||{}).INDOBASE_RECORDS_BASE||'';
let products=${productsJson};
const cart=[];
function pbItems(payload){if(Array.isArray(payload))return payload;if(payload&&Array.isArray(payload.items))return payload.items;if(payload&&Array.isArray(payload.records))return payload.records.map(x=>x.record||x);return []}
function money(v,c){const n=Number(v||0);const cur=c||'INR';try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:cur}).format(n)}catch(e){return '₹'+n.toLocaleString('en-IN')}}
function setError(msg){const el=document.querySelector('#error');if(!msg){el.hidden=true;el.textContent='';return}el.hidden=false;el.textContent=msg}
function cartQty(){return cart.reduce((s,i)=>s+i.qty,0)}
function cartSum(){return cart.reduce((s,i)=>s+i.qty*Number(i.price||0),0)}
function renderCart(){
  document.querySelector('#cartCount').textContent=String(cartQty());
  document.querySelector('#cartTotal').textContent=money(cartSum(), (cart[0]&&cart[0].currency)||'INR');
  const list=document.querySelector('#cartList');
  list.innerHTML=cart.length?cart.map(i=>'<li><span>'+i.name+' × '+i.qty+'</span><span>'+money(i.qty*Number(i.price||0),i.currency)+'</span></li>').join(''):'<li class="meta">Cart is empty</li>';
}
function render(){
  const grid=document.querySelector('#grid');
  if(!products.length){grid.innerHTML='<p class="empty">No products yet. Seed catalog via Indobase Builder, then refresh.</p>';return}
  grid.innerHTML=products.map((p,idx)=>{
    const stock=Number(p.stock||0);
    const img=p.image_url?('<img src="'+String(p.image_url).replace(/"/g,'&quot;')+'" alt=""/>'):'<img alt="" src="data:image/svg+xml,'+encodeURIComponent('<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"400\\" height=\\"300\\"><rect fill=\\"#e5e7eb\\" width=\\"100%\\" height=\\"100%\\"/><text x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" fill=\\"#9ca3af\\" font-family=\\"sans-serif\\" font-size=\\"18\\">No image</text></svg>')+'"/>';
    return '<article class="card">'+img+'<div class="body"><h2>'+(p.name||'Product')+'</h2><div class="meta">'+(p.description||p.slug||'')+'</div><div class="row"><span class="price">'+money(p.price,p.currency)+'</span><span class="meta">'+stock+' in stock</span></div><button type="button" class="add" data-i="'+idx+'" '+(stock>0?'':'disabled')+'>Add to cart</button></div></article>';
  }).join('');
  grid.querySelectorAll('button.add').forEach(btn=>btn.addEventListener('click',()=>{
    const p=products[Number(btn.getAttribute('data-i'))];
    if(!p||Number(p.stock||0)<=0)return;
    const slug=String(p.slug||p.id||'');
    const existing=cart.find(c=>c.slug===slug);
    if(existing){if(existing.qty<Number(p.stock||0))existing.qty+=1}else{cart.push({slug,name:String(p.name||slug),price:Number(p.price||0),currency:String(p.currency||'INR'),qty:1})}
    renderCart();
  }));
}
async function loadProducts(){
  setError('');
  if(!API||!window.__INDOBASE_COLLECTION__){render();document.querySelector('#status').textContent='Snapshot catalog';return}
  try{
    const col=window.__INDOBASE_COLLECTION__('products');
    const res=await fetch(API+'/'+col+'/records?perPage=200&sort=-created_at');
    const json=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error((json&&json.message)||('Catalog HTTP '+res.status));
    const live=pbItems(json).filter(p=>p.active!==false);
    if(live.length)products=live;
    render();
    document.querySelector('#status').textContent='Live catalog · '+products.length+' products · updated '+new Date().toLocaleTimeString();
  }catch(e){
    render();
    document.querySelector('#status').textContent='Showing snapshot — live refresh failed';
    setError(e&&e.message?e.message:'Could not load live catalog');
  }
}
async function placeOrder(email){
  if(!cart.length)throw new Error('Cart is empty');
  if(!API||!window.__INDOBASE_COLLECTION__)throw new Error('Backend not configured');
  const ordersCol=window.__INDOBASE_COLLECTION__('orders');
  const itemsCol=window.__INDOBASE_COLLECTION__('order_items');
  const currency=(cart[0]&&cart[0].currency)||'INR';
  const total=cartSum();
  const orderBody={email,status:'pending',total,currency,items_json:cart.map(i=>({product_slug:i.slug,quantity:i.qty,unit_price:i.price}))};
  const or=await fetch(API+'/'+ordersCol+'/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(orderBody)});
  const oj=await or.json().catch(()=>({}));
  if(!or.ok)throw new Error((oj&&(oj.message||oj.data&&oj.data.message))||('Order HTTP '+or.status));
  const orderId=oj.id||(oj.record&&oj.record.id);
  if(orderId&&itemsCol){
    await Promise.all(cart.map(i=>fetch(API+'/'+itemsCol+'/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,product_slug:i.slug,quantity:i.qty,unit_price:i.price})})));
  }
  return orderId||'ok';
}
document.querySelector('#openCart').addEventListener('click',()=>{renderCart();document.querySelector('#cartDlg').showModal()});
document.querySelector('#closeCart').addEventListener('click',()=>document.querySelector('#cartDlg').close());
document.querySelector('#checkoutForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();
  const email=new FormData(ev.target).get('email');
  const btn=document.querySelector('#placeOrder');
  btn.disabled=true;
  setError('');
  try{
    const id=await placeOrder(String(email||'').trim());
    cart.length=0;renderCart();
    document.querySelector('#checkoutNote').textContent='Order placed ('+id+'). Check Admin for status.';
    setTimeout(()=>document.querySelector('#cartDlg').close(),900);
  }catch(e){
    setError(e&&e.message?e.message:'Checkout failed');
    document.querySelector('#checkoutNote').textContent=e&&e.message?e.message:'Checkout failed';
  }finally{btn.disabled=false}
});
render();
renderCart();
loadProducts();
</script>
</body>
</html>`
}
