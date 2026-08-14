/**
 * DesignSpec owns visual identity. Commerce ABI is injected as capability, not a template.
 */

import { cssVariablesFromTokens, designSpecFromBusinessSpec } from './design-system.js'
import type { BusinessSpec } from './business-spec.js'

export function buildSpecBoundStorefrontHtml(opts: {
  spec: BusinessSpec
  projectRef: string
  products?: Array<Record<string, unknown>>
}): string {
  const design = designSpecFromBusinessSpec(opts.spec)
  const tokens = design.colorPalette
  const brand = escapeAttr(opts.spec.businessName)
  const vertical = escapeAttr(opts.spec.catalog.verticalId)
  const products = (opts.products || []).map((p) => ({
    id: String(p.id || p.slug || ''),
    name: String(p.name || ''),
    description: String(p.description || ''),
    price: Number(p.price || 0),
    currency: String(p.currency || opts.spec.currency || 'INR'),
    stock: Number(p.stock || 0),
    variantId: `${p.id || p.slug || 'p'}-v0`,
  }))
  const snapshot = JSON.stringify(products)
  const cards = products
    .map(
      (p) =>
        `<article class="card" data-product="${escapeAttr(p.id)}"><div class="body"><h2>${escapeAttr(p.name)}</h2><p class="meta">${escapeAttr(p.description)}</p><div class="row"><span class="price">${escapeAttr(p.currency)} ${p.price}</span><button class="add" data-product="${escapeAttr(p.id)}" data-variant="${escapeAttr(p.variantId)}">Add to cart</button></div></div></article>`,
    )
    .join('')
  const pad = tokens.density === 'airy' ? '48px 28px' : tokens.density === 'dense' ? '16px 18px' : '28px 22px'
  const headerDir = tokens.nav === 'editorial' ? 'column' : 'row'
  const vars = cssVariablesFromTokens(tokens)
  return `<!DOCTYPE html>
<html lang="en" data-ib-project="${escapeAttr(opts.projectRef)}" data-ib-vertical="${vertical}" data-ib-type="${escapeAttr(opts.spec.businessType)}" data-ib-nav="${tokens.nav}" data-ib-design="${design.specHash}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title>
<style>
${vars}
*{box-sizing:border-box}body{margin:0;font-family:var(--body);color:var(--ink);background:var(--bg)}
header[data-ib-section="hero"]{display:flex;flex-direction:${headerDir};justify-content:space-between;gap:20px;padding:${pad};background:var(--bg);border-bottom:1px solid var(--line)}
h1,h2{font-family:var(--heading);color:var(--primary)}
.brand p{margin:6px 0 0;color:var(--muted)}
main{max-width:1080px;margin:0 auto;padding:24px 18px 72px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.card .body{padding:14px;display:grid;gap:8px}
.meta{color:var(--muted);font-size:13px}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
button.add{border:0;background:var(--primary);color:#fff;padding:8px 12px;border-radius:var(--radius);cursor:pointer;font:inherit}
@media(max-width:720px){header[data-ib-section="hero"]{flex-direction:column} .grid{grid-template-columns:1fr}}
</style>
<script src="/api/os/commerce/runtime.js"></script>
</head>
<body>
<header data-ib-section="hero"><div class="brand"><h1>${brand}</h1><p>${escapeAttr(opts.spec.industry)} · ${escapeAttr(opts.spec.visualStyle)}</p></div></header>
<main data-ib-section="products" data-ib-catalog="snapshot"><p id="status">Loading catalog…</p><div class="grid" id="grid">${cards}</div></main>
<script>
window.__IB_CATALOG_SNAPSHOT__=${snapshot};
(function(){
  var c=window.indobase&&window.indobase.commerce;
  var grid=document.getElementById("grid");
  function render(products){
    if(!grid) return;
    grid.innerHTML=(products||[]).map(function(p){
      var v=(p.variants&&p.variants[0]&&p.variants[0].id)||(p.id+"-v0");
      return '<article class="card"><div class="body"><h2>'+String(p.name||"")+'</h2><div class="row"><span class="price"></span><button class="add" data-product="'+p.id+'" data-variant="'+v+'">Add to cart</button></div></div></article>';
    }).join("");
  }
  document.addEventListener("click",function(e){
    var t=e.target;
    if(!t||!t.getAttribute||!t.classList.contains("add")) return;
    var pid=t.getAttribute("data-product");
    var vid=t.getAttribute("data-variant");
    if(c&&c.cart&&c.cart.add) c.cart.add(pid,1,vid);
  });
  if(c&&c.products&&c.products.list){
    c.products.list().then(function(rows){ if(rows&&rows.length){ render(rows); document.getElementById("status").textContent="Catalog connected"; } else { document.getElementById("status").textContent="Showing catalog snapshot"; } }).catch(function(){ document.getElementById("status").textContent="Showing catalog snapshot"; });
  } else {
    document.getElementById("status").textContent="Showing catalog snapshot";
  }
})();
</script>
</body></html>`
}

function escapeAttr(value: string): string {
  return value.replace(/[<>&"]/g, '')
}
