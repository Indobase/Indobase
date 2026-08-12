/**
 * Commerce frontend runtime — stable ABI for generated storefronts.
 * Served at GET /api/os/commerce/runtime.js and inlined into managed storefront.
 *
 * window.indobase.commerce.products | .cart | .checkout | .orders
 * Never call PocketBase / Razorpay / Stripe from generated UI.
 */

export function buildCommerceRuntimeJs(opts: {
  commerceBaseUrl: string
  projectRef: string
}): string {
  const base = JSON.stringify(opts.commerceBaseUrl.replace(/\/+$/, ''))
  const ref = JSON.stringify(opts.projectRef)

  return `(function(){
"use strict";
var BASE=${base};
var PROJECT_REF=${ref};
function storageKey(k){return "indobase.commerce."+PROJECT_REF+"."+k}
function loadCart(){
  try{return JSON.parse(localStorage.getItem(storageKey("cart"))||"[]")}catch(e){return []}
}
function saveCart(items){
  localStorage.setItem(storageKey("cart"), JSON.stringify(items||[]));
}
function uuid(){
  if(crypto&&crypto.randomUUID)return crypto.randomUUID();
  return "idem_"+Date.now()+"_"+Math.random().toString(16).slice(2);
}
async function api(path, init){
  var res=await fetch(BASE+path, Object.assign({
    headers: Object.assign({
      "Content-Type":"application/json",
      "X-Indobase-Project-Ref": PROJECT_REF
    }, (init&&init.headers)||{})
  }, init||{}));
  var json=await res.json().catch(function(){return {}});
  if(!res.ok){
    var err=new Error((json&&json.message)||("Commerce HTTP "+res.status));
    err.code=json&&json.code; err.status=res.status; err.body=json;
    throw err;
  }
  return json;
}
var cartApi={
  get:function(){return loadCart()},
  clear:function(){saveCart([]); return []},
  add:function(productId, quantity){
    var qty=Math.max(1, Math.floor(Number(quantity)||1));
    var items=loadCart();
    var hit=items.find(function(i){return i.productId===productId});
    if(hit) hit.quantity+=qty; else items.push({productId:String(productId), quantity:qty});
    saveCart(items); return items;
  },
  set:function(productId, quantity){
    var qty=Math.floor(Number(quantity)||0);
    var items=loadCart().filter(function(i){return i.productId!==productId});
    if(qty>0) items.push({productId:String(productId), quantity:qty});
    saveCart(items); return items;
  },
  remove:function(productId){
    var items=loadCart().filter(function(i){return i.productId!==productId});
    saveCart(items); return items;
  }
};
var productsApi={
  list:function(){return api("/products?projectRef="+encodeURIComponent(PROJECT_REF)).then(function(r){return r.products||[]})},
  get:function(id){return api("/products/"+encodeURIComponent(id)+"?projectRef="+encodeURIComponent(PROJECT_REF)).then(function(r){return r.product})}
};
var checkoutApi={
  create:function(input){
    var items=(input&&input.items)||cartApi.get();
    var body={
      projectRef: PROJECT_REF,
      idempotencyKey: (input&&input.idempotencyKey)||uuid(),
      items: items,
      customer: (input&&input.customer)||{},
      shippingAddress: input&&input.shippingAddress,
      returnUrl: input&&input.returnUrl
    };
    return api("/checkout", { method:"POST", body: JSON.stringify(body), headers: { "Idempotency-Key": body.idempotencyKey } });
  }
};
var ordersApi={
  get:function(orderId){
    return api("/orders/"+encodeURIComponent(orderId)+"?projectRef="+encodeURIComponent(PROJECT_REF));
  }
};
window.indobase=window.indobase||{};
window.indobase.commerce={
  projectRef: PROJECT_REF,
  baseUrl: BASE,
  products: productsApi,
  cart: cartApi,
  checkout: checkoutApi,
  orders: ordersApi,
  customer: { getCurrent: function(){ return Promise.resolve({ authenticated:false }) } }
};
})();`
}
