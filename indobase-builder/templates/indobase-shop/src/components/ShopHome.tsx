import { useState } from 'react';
import type { Session } from '@indobaseinc/indobase-js';
import { requireIndobase } from '../lib/indobase';

const SAMPLE_PRODUCTS = [
  { id: '1', name: 'Indobase Tee', price: 499, description: 'Soft cotton tee' },
  { id: '2', name: 'Studio Mug', price: 299, description: 'Ceramic mug' },
  { id: '3', name: 'Builder Sticker Pack', price: 149, description: '5 vinyl stickers' },
];

type CartItem = { id: string; name: string; price: number; qty: number };

export function ShopHome({ session }: { session: Session }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (product: (typeof SAMPLE_PRODUCTS)[number]) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...current, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const signOut = async () => {
    await requireIndobase().auth.signOut();
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;
    alert(`Order placed for ₹${total} — connect orders table via Indobase to persist.`);
    setCart([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Indobase Shop</h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{session.user.email}</span>
          <button type="button" onClick={signOut} className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-900">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-medium">Products</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {SAMPLE_PRODUCTS.map((product) => (
              <li key={product.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <h3 className="font-medium">{product.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{product.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-amber-400">₹{product.price}</span>
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    className="rounded-lg bg-amber-500 px-3 py-1 text-sm font-medium text-slate-950 hover:bg-amber-400"
                  >
                    Add to cart
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <aside className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-lg font-medium">Cart</h2>
          {cart.length === 0 ? (
            <p className="text-sm text-slate-500">Your cart is empty.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {cart.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>
                    {item.name} × {item.qty}
                  </span>
                  <span>₹{item.price * item.qty}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-slate-800 pt-3 font-medium">Total: ₹{total}</p>
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={placeOrder}
            className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium disabled:opacity-40"
          >
            Place order
          </button>
        </aside>
      </main>
    </div>
  );
}
