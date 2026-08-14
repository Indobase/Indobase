/**
 * Commerce frontend runtime — stable ABI for generated storefronts.
 * Served at GET /api/os/commerce/runtime.js and inlined into managed storefront.
 *
 * window.indobase.commerce.products | .cart | .checkout | .orders | .customer
 * Never call PocketBase / Razorpay / Stripe from generated UI.
 *
 * V1.1 session token lives in localStorage because the storefront is a static
 * ABI (no first-party cookie domain on every published site). That is not the
 * ideal production session: XSS can read the token. Security backlog is
 * HttpOnly+Secure+SameSite cookie + CSP — do not block V1.1 on that swap.
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
  try{
    var raw=localStorage.getItem(storageKey("cart"));
    var parsed=raw?JSON.parse(raw):[];
    if(!Array.isArray(parsed)) return [];
    return parsed.filter(function(i){
      return i && typeof i==="object" && i.variantId && Math.floor(Number(i.quantity)||0)>0;
    }).map(function(i){
      return {productId:String(i.productId||""), variantId:String(i.variantId), quantity:Math.max(1, Math.floor(Number(i.quantity)||1))};
    });
  }catch(e){return []}
}
function saveCart(items){
  try{localStorage.setItem(storageKey("cart"), JSON.stringify(items||[]))}catch(e){}
}
var CartStore={
  load:loadCart,
  save:saveCart,
  clear:function(){saveCart([]); return []},
  addItem:function(productId, quantity, variantId){
    if(!variantId) return loadCart();
    var qty=Math.max(1, Math.floor(Number(quantity)||1));
    var vid=String(variantId);
    var items=loadCart();
    var hit=items.find(function(i){return i.productId===productId && String(i.variantId||"")===vid});
    if(hit) hit.quantity+=qty; else items.push({productId:String(productId), variantId:vid, quantity:qty});
    saveCart(items); return items;
  },
  removeItem:function(productId, variantId){
    var vid=String(variantId||"");
    var items=loadCart().filter(function(i){return !(i.productId===productId && String(i.variantId||"")===vid)});
    saveCart(items); return items;
  },
  updateQuantity:function(productId, quantity, variantId){
    var qty=Math.floor(Number(quantity)||0);
    var vid=String(variantId||"");
    var items=loadCart().filter(function(i){return !(i.productId===productId && String(i.variantId||"")===vid)});
    if(qty>0 && vid) items.push({productId:String(productId), variantId:vid, quantity:qty});
    saveCart(items); return items;
  },
  validate:function(){return loadCart()}
};
function uuid(){
  if(crypto&&crypto.randomUUID)return crypto.randomUUID();
  return "idem_"+Date.now()+"_"+Math.random().toString(16).slice(2);
}
function loadCustomerToken(){
  try{return localStorage.getItem(storageKey("customerToken"))||""}catch(e){return ""}
}
function saveCustomerToken(token){
  try{
    if(token) localStorage.setItem(storageKey("customerToken"), token);
    else localStorage.removeItem(storageKey("customerToken"));
  }catch(e){}
}
async function api(path, init){
  var headers={
    "Content-Type":"application/json",
    "X-Indobase-Project-Ref": PROJECT_REF
  };
  var token=loadCustomerToken();
  if(token) headers.Authorization="Bearer "+token;
  if(init&&init.headers) Object.assign(headers, init.headers);
  var res;
  try{
    res=await fetch(BASE+path, Object.assign({}, init||{}, { headers: headers }));
  }catch(e){
    var net=new Error("I couldn't complete the order yet. I'll fix the checkout connection.");
    net.code="checkout_failed"; net.status=0; throw net;
  }
  var json=await res.json().catch(function(){return {}});
  if(!res.ok){
    var raw=(json&&json.message)||"";
    var safe=/fetch failed|paymentStatus|ECONNREFUSED|backend_unavailable|checkout_failed|HTTP /i.test(raw)
      ? "I couldn't complete the order yet. I'll fix the checkout connection."
      : (raw||"I couldn't complete the order yet. I'll fix the checkout connection.");
    var err=new Error(safe);
    err.code=json&&json.code; err.status=res.status; err.body=json;
    throw err;
  }
  return json;
}
var cartApi={
  get:function(){return CartStore.load()},
  clear:function(){return CartStore.clear()},
  add:function(productId, quantity, variantId){
    return CartStore.addItem(productId, quantity, variantId);
  },
  set:function(productId, quantity, variantId){
    return CartStore.updateQuantity(productId, quantity, variantId);
  },
  remove:function(productId, variantId){
    return CartStore.removeItem(productId, variantId);
  }
};
var productsApi={
  list:function(){return api("/products?projectRef="+encodeURIComponent(PROJECT_REF)).then(function(r){return r.products||[]})},
  get:function(id){return api("/products/"+encodeURIComponent(id)+"?projectRef="+encodeURIComponent(PROJECT_REF)).then(function(r){return r.product})}
};
var collectionsApi={
  list:function(){return api("/collections?projectRef="+encodeURIComponent(PROJECT_REF)).then(function(r){return r.collections||[]})}
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
    return api("/checkout", { method:"POST", body: JSON.stringify(body), headers: { "Idempotency-Key": body.idempotencyKey } }).then(function(r){
      if(r&&r.guestToken&&r.orderId){
        try{localStorage.setItem(storageKey("guestToken."+r.orderId), r.guestToken)}catch(e){}
      }
      return r;
    });
  }
};
var ordersApi={
  get:function(orderId, guestToken){
    var token=guestToken;
    if(!token){
      try{token=localStorage.getItem(storageKey("guestToken."+orderId))||""}catch(e){token=""}
    }
    var q="?projectRef="+encodeURIComponent(PROJECT_REF);
    if(token) q+="&guestToken="+encodeURIComponent(token);
    return api("/orders/"+encodeURIComponent(orderId)+q);
  },
  list:function(){
    return api("/customer/orders?projectRef="+encodeURIComponent(PROJECT_REF)).then(function(r){return r.orders||[]});
  }
};
var customerApi={
  getCurrent:function(){return api("/customer/me?projectRef="+encodeURIComponent(PROJECT_REF))},
  token:function(){return loadCustomerToken()},
  startOtp:function(input){
    return api("/customer/otp/start",{method:"POST",body:JSON.stringify({projectRef:PROJECT_REF,email:input&&input.email,name:input&&input.name})});
  },
  verifyOtp:function(input){
    return api("/customer/otp/verify",{method:"POST",body:JSON.stringify({projectRef:PROJECT_REF,email:input&&input.email,code:input&&input.code,name:input&&input.name})}).then(function(r){
      if(r&&r.token) saveCustomerToken(r.token);
      return r;
    });
  },
  logout:function(){
    saveCustomerToken("");
    return api("/customer/logout",{method:"POST",body:JSON.stringify({projectRef:PROJECT_REF})});
  },
  orders: ordersApi
};
window.indobase=window.indobase||{};
window.indobase.commerce={
  projectRef: PROJECT_REF,
  baseUrl: BASE,
  CartStore: CartStore,
  products: productsApi,
  collections: collectionsApi,
  cart: cartApi,
  checkout: checkoutApi,
  orders: ordersApi,
  customer: customerApi
};
})();`
}
