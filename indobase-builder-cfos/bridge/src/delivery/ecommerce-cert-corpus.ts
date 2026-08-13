/**
 * Ecommerce certification corpus — 20 distinct store intents.
 * Used to prove the frozen job produces a real store, not one prompt.
 */

export type EcommerceCertStore = {
  id: string
  brand: string
  verticalId: string
  prompt: string
}

export const ECOMMERCE_CERT_CORPUS: readonly EcommerceCertStore[] = [
  {
    id: 'fashion',
    brand: 'Threadline',
    verticalId: 'apparel',
    prompt: 'Launch an online fashion store called Threadline selling jackets, shirts, and leather bags.',
  },
  {
    id: 'electronics',
    brand: 'Volt & Co',
    verticalId: 'electronics',
    prompt: 'Build an electronics shop named Volt & Co with headphones, chargers, and gadgets plus checkout.',
  },
  {
    id: 'jewelry',
    brand: 'Aurelia',
    verticalId: 'beauty',
    prompt: 'Create a jewelry boutique called Aurelia that sells rings and necklaces online with real inventory.',
  },
  {
    id: 'furniture',
    brand: 'Oak & Ember',
    verticalId: 'home',
    prompt: 'Launch a furniture store called Oak & Ember with shelves, vases, and home pieces customers can buy.',
  },
  {
    id: 'cosmetics',
    brand: 'Lumen Beauty',
    verticalId: 'beauty',
    prompt: 'Build a cosmetics store called Lumen Beauty with skincare and makeup, cart, and checkout.',
  },
  {
    id: 'grocery',
    brand: 'Namma Kirana',
    verticalId: 'food-grocery',
    prompt: 'Launch a grocery store called Namma Kirana for pantry staples with stock and online ordering.',
  },
  {
    id: 'pets',
    brand: 'Paw Parade',
    verticalId: 'sports',
    prompt: 'Create a pet supplies shop called Paw Parade selling bowls, toys, and treats with checkout.',
  },
  {
    id: 'sports',
    brand: 'Rally Kit',
    verticalId: 'sports',
    prompt: 'Build a sports store called Rally Kit with yoga mats, bands, and bottles plus live inventory.',
  },
  {
    id: 'books',
    brand: 'Page & Co',
    verticalId: 'home',
    prompt: 'Launch an online bookstore called Page & Co where customers browse titles and place orders.',
  },
  {
    id: 'home-decor',
    brand: 'Hearth Edit',
    verticalId: 'home',
    prompt: 'Create a home decor shop called Hearth Edit with candles, textiles, and shelves.',
  },
  {
    id: 'food',
    brand: 'Tiffin Box',
    verticalId: 'food-grocery',
    prompt: 'Build a food shop called Tiffin Box that sells ready meals and snacks with checkout.',
  },
  {
    id: 'auto-parts',
    brand: 'Torque Parts',
    verticalId: 'electronics',
    prompt: 'Launch an automotive parts store called Torque Parts with catalog, cart, and order placement.',
  },
  {
    id: 'b2b-wholesale',
    brand: 'Bulk Lane',
    verticalId: 'electronics',
    prompt: 'Create a B2B wholesale store called Bulk Lane for retailers to order products in quantity.',
  },
  {
    id: 'digital',
    brand: 'Pixel Press',
    verticalId: 'electronics',
    prompt: 'Build a digital products shop called Pixel Press that sells downloadable kits with checkout.',
  },
  {
    id: 'luxury',
    brand: 'Maison North',
    verticalId: 'apparel',
    prompt: 'Launch a luxury store called Maison North with premium apparel and a refined checkout.',
  },
  {
    id: 'kids',
    brand: 'Little Orbit',
    verticalId: 'apparel',
    prompt: 'Create a kids store called Little Orbit selling clothes and everyday items with inventory.',
  },
  {
    id: 'beauty',
    brand: 'Glow Ritual',
    verticalId: 'beauty',
    prompt: 'Build a beauty store called Glow Ritual with serums and balms, cart, and payments-ready checkout.',
  },
  {
    id: 'fitness',
    brand: 'Form Lab',
    verticalId: 'sports',
    prompt: 'Launch a health and fitness shop called Form Lab with training gear and stocked products.',
  },
  {
    id: 'local-retail',
    brand: 'Corner & Co',
    verticalId: 'food-grocery',
    prompt: 'Create a local retailer site called Corner & Co so neighborhood customers can order online.',
  },
  {
    id: 'restaurant',
    brand: 'Saffron Counter',
    verticalId: 'food-grocery',
    prompt: 'Build a restaurant ordering website called Saffron Counter with menu items, cart, and checkout.',
  },
] as const
