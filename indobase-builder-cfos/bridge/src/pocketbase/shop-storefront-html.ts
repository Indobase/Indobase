import { buildManagedPublicEnv } from './managed.js'
import { buildCommerceRuntimeJs } from '../commerce/runtime.js'

export type ManagedShopStorefrontRow = Record<string, unknown>

/**
 * Functional storefront — Presentation + Commerce Runtime ABI only.
 * Does NOT call PocketBase records API for cart/checkout/orders.
 */
export function buildManagedShopStorefrontHtml(opts: {
  brand?: string
  tagline?: string
  appId: string
  publicUrl: string
  /** Bridge public origin for commerce API (default builder.indobase.in). */
  commerceBaseUrl?: string
  products?: ManagedShopStorefrontRow[]
}): string {
  const brand = (opts.brand || 'Shop').replace(/[<>&"]/g, '')
  const tagline = (opts.tagline || 'Order online — powered by Indobase Commerce.').replace(
    /[<>&"]/g,
    '',
  )
  const env = buildManagedPublicEnv({ publicUrl: opts.publicUrl, appId: opts.appId })
  const bridge =
    (opts.commerceBaseUrl ||
      process.env.INDOBASE_BRIDGE_PUBLIC_URL ||
      process.env.BRIDGE_PUBLIC_URL ||
      'https://builder.indobase.in'
    ).replace(/\/+$/, '')
  const commerceBase = `${bridge}/api/os/commerce`
  env.INDOBASE_COMMERCE_URL = commerceBase
  const runtime = buildCommerceRuntimeJs({
    commerceBaseUrl: commerceBase,
    projectRef: opts.appId,
  })
  const snapshot = JSON.stringify(
    (opts.products || []).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      priceMinor: Math.round(Number(p.price || 0) * 100),
      currency: p.currency || 'INR',
      stock: Number(p.stock || 0),
      imageUrl: p.image_url || '',
      active: p.active !== false,
    })),
  )

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
  .dlg li { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:14px; }
  .qty { display:flex; align-items:center; gap:6px; }
  .qty-btn { border:1px solid var(--line); background:#fff; padding:2px 8px; border-radius:6px; cursor:pointer; font:inherit; }
  .dlg input, .dlg label { width:100%; }
  .dlg input { margin-top:4px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font:inherit; }
  .dlg .actions { display:flex; gap:8px; justify-content:flex-end; }
  .dlg .actions button { padding:9px 14px; border-radius:8px; border:1px solid var(--line); background:#fff; font:inherit; cursor:pointer; }
  .dlg .actions .primary { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; }
  .empty { color:var(--muted); padding:28px 8px; text-align:center; }
  .toolbar { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 16px; }
  .toolbar input { flex:1; min-width:180px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font:inherit; }
  .card { cursor:pointer; }
  @media (max-width:720px) { .grid { grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); } header { padding:16px; } }
  @media (min-width:1100px) { .grid { grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); } }
</style>
<script>window.__INDOBASE_ENV__=${JSON.stringify(env)};</script>
<script>${runtime}</script>
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
  <div class="toolbar">
    <input id="search" type="search" placeholder="Search products" aria-label="Search products"/>
  </div>
  <div class="grid" id="grid"></div>
</main>
<dialog id="pdpDlg">
  <div class="dlg">
    <h2 id="pdpName">Product</h2>
    <p class="meta" id="pdpMeta"></p>
    <div class="row"><span class="price" id="pdpPrice"></span><span class="meta" id="pdpStock"></span></div>
    <div class="actions">
      <button type="button" id="closePdp">Close</button>
      <button class="primary" type="button" id="pdpAdd">Add to cart</button>
    </div>
  </div>
</dialog>
<dialog id="confirmDlg">
  <div class="dlg">
    <h2>Order confirmed</h2>
    <p class="meta" id="confirmNote">Your order was created by Indobase Commerce.</p>
    <p><strong id="confirmOrderId"></strong></p>
    <div class="actions"><button type="button" id="closeConfirm">Done</button></div>
  </div>
</dialog>
<dialog id="cartDlg">
  <form method="dialog" class="dlg" id="checkoutForm">
    <h2>Checkout</h2>
    <ul id="cartList"></ul>
    <div class="row"><strong>Estimated</strong><strong id="cartTotal">—</strong></div>
    <p class="meta">Final price is calculated by Indobase Commerce (not from this page).</p>
    <label>Name<input type="text" name="name" placeholder="Your name" autocomplete="name"/></label>
    <label>Email<input required type="email" name="email" placeholder="you@example.com" autocomplete="email"/></label>
    <p class="meta" id="checkoutNote">Creates a real order via commerce.checkout — never writes PocketBase directly.</p>
    <div class="actions">
      <button type="button" id="closeCart">Close</button>
      <button class="primary" type="submit" id="placeOrder">Checkout</button>
    </div>
  </form>
</dialog>
<script>
const commerce=window.indobase.commerce;
let products=${snapshot};
function moneyMinor(minor,c){
  var n=Number(minor||0)/100; var cur=c||'INR';
  try{return new Intl.NumberFormat('en-IN',{style:'currency',currency:cur}).format(n)}catch(e){return '₹'+n.toLocaleString('en-IN')}
}
function setError(msg){var el=document.querySelector('#error'); if(!msg){el.hidden=true;el.textContent='';return} el.hidden=false; el.textContent=msg}
function productById(id){return products.find(function(p){return p.id===id})}
function renderCart(){
  var items=commerce.cart.get();
  var count=items.reduce(function(s,i){return s+i.quantity},0);
  document.querySelector('#cartCount').textContent=String(count);
  var list=document.querySelector('#cartList');
  var est=0; var cur='INR';
  list.innerHTML=items.length?items.map(function(i){
    var p=productById(i.productId); var name=p?p.name:i.productId;
    var line=p?(p.priceMinor*i.quantity):0; est+=line; if(p)cur=p.currency||cur;
    return '<li><span>'+name+'</span><span class="qty"><button type="button" class="qty-btn" data-act="dec" data-id="'+i.productId+'">−</button><span>'+i.quantity+'</span><button type="button" class="qty-btn" data-act="inc" data-id="'+i.productId+'">+</button><button type="button" class="qty-btn" data-act="rm" data-id="'+i.productId+'">Remove</button></span><span>'+moneyMinor(line,cur)+'</span></li>';
  }).join(''):'<li class="meta">Cart is empty</li>';
  document.querySelector('#cartTotal').textContent=items.length?moneyMinor(est,cur):'—';
}
function visibleProducts(){
  var q=(document.querySelector('#search')&&document.querySelector('#search').value||'').trim().toLowerCase();
  if(!q) return products;
  return products.filter(function(p){
    return String(p.name||'').toLowerCase().indexOf(q)>=0 || String(p.description||p.slug||'').toLowerCase().indexOf(q)>=0;
  });
}
function openPdp(id){
  var p=productById(id); if(!p) return;
  document.querySelector('#pdpName').textContent=p.name||'Product';
  document.querySelector('#pdpMeta').textContent=p.description||p.slug||'';
  document.querySelector('#pdpPrice').textContent=moneyMinor(p.priceMinor,p.currency);
  document.querySelector('#pdpStock').textContent=Number(p.stock||0)+' in stock';
  document.querySelector('#pdpAdd').setAttribute('data-id', p.id);
  document.querySelector('#pdpAdd').disabled=Number(p.stock||0)<=0;
  document.querySelector('#pdpDlg').showModal();
}
function render(){
  var grid=document.querySelector('#grid');
  var list=visibleProducts();
  if(!list.length){grid.innerHTML='<p class="empty">No products yet.</p>';return}
  grid.innerHTML=list.map(function(p){
    var stock=Number(p.stock||0);
    var img=p.imageUrl?('<img src="'+String(p.imageUrl).replace(/"/g,'&quot;')+'" alt=""/>'):'<div class="food" style="height:140px;background:#eee"></div>';
    return '<article class="card">'+img+'<div class="body"><h2>'+(p.name||'Product')+'</h2><div class="meta">'+(p.description||p.slug||'')+'</div><div class="row"><span class="price">'+moneyMinor(p.priceMinor,p.currency)+'</span><span class="meta">'+stock+' in stock</span></div><button type="button" class="add" data-id="'+p.id+'" '+(stock>0?'':'disabled')+'>Add to cart</button></div></article>';
  }).join('');
  grid.querySelectorAll('button.add').forEach(function(btn){
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      commerce.cart.add(btn.getAttribute('data-id'), 1);
      renderCart();
    });
  });
  grid.querySelectorAll('article.card').forEach(function(card){
    card.addEventListener('click', function(){
      var id=card.querySelector('button.add')&&card.querySelector('button.add').getAttribute('data-id');
      if(id) openPdp(id);
    });
  });
}
async function loadProducts(){
  setError('');
  try{
    var live=await commerce.products.list();
    if(live&&live.length) products=live;
    render();
    document.querySelector('#status').textContent='Live catalog via Indobase Commerce · '+products.length+' products';
  }catch(e){
    render();
    document.querySelector('#status').textContent='Showing snapshot — catalog refresh failed';
    setError(e&&e.message?e.message:'Could not load catalog');
  }
  renderCart();
}
document.querySelector('#cartList').addEventListener('click', function(ev){
  var btn=ev.target&&ev.target.closest?ev.target.closest('.qty-btn'):null;
  if(!btn) return;
  ev.preventDefault();
  var id=btn.getAttribute('data-id'); var act=btn.getAttribute('data-act');
  var items=commerce.cart.get(); var hit=items.find(function(i){return i.productId===id});
  var qty=hit?hit.quantity:0;
  if(act==='inc') commerce.cart.set(id, qty+1);
  else if(act==='dec') commerce.cart.set(id, qty-1);
  else if(act==='rm') commerce.cart.remove(id);
  renderCart();
});
document.querySelector('#openCart').addEventListener('click', function(){ renderCart(); document.querySelector('#cartDlg').showModal(); });
document.querySelector('#closeCart').addEventListener('click', function(){ document.querySelector('#cartDlg').close(); });
document.querySelector('#checkoutForm').addEventListener('submit', async function(ev){
  ev.preventDefault();
  var fd=new FormData(ev.target);
  var btn=document.querySelector('#placeOrder');
  btn.disabled=true; setError('');
  document.querySelector('#checkoutNote').textContent='Creating checkout…';
  try{
    var result=await commerce.checkout.create({
      customer: { email: String(fd.get('email')||'').trim(), name: String(fd.get('name')||'').trim() }
    });
    commerce.cart.clear(); renderCart();
    document.querySelector('#checkoutNote').textContent=result.message||('Order '+result.orderId);
    if(result.paymentUrl){
      window.location.href=result.paymentUrl;
      return;
    }
    document.querySelector('#cartDlg').close();
    document.querySelector('#confirmNote').textContent=result.message||('Amount '+moneyMinor(result.amountMinor, result.currency));
    document.querySelector('#confirmOrderId').textContent='Order '+result.orderId;
    document.querySelector('#confirmDlg').showModal();
  }catch(e){
    setError(e&&e.message?e.message:'Checkout failed');
    document.querySelector('#checkoutNote').textContent=e&&e.message?e.message:'Checkout failed';
  }finally{ btn.disabled=false; }
});
document.querySelector('#search').addEventListener('input', render);
document.querySelector('#closePdp').addEventListener('click', function(){ document.querySelector('#pdpDlg').close(); });
document.querySelector('#pdpAdd').addEventListener('click', function(){
  commerce.cart.add(document.querySelector('#pdpAdd').getAttribute('data-id'), 1);
  renderCart();
  document.querySelector('#pdpDlg').close();
});
document.querySelector('#closeConfirm').addEventListener('click', function(){ document.querySelector('#confirmDlg').close(); });
render(); renderCart(); loadProducts();
</script>
</body>
</html>`
}
