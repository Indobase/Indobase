/**
 * Indobase Design — built-in template library.
 *
 * These are Fabric.js `canvas.toJSON()` documents. Authoring templates as plain JSON is the whole
 * reason this engine replaced the Penpot fork: Penpot's `.penpot` files are binary/zip archives with
 * strict internal schemas that cannot be hand-authored or generated, so its gallery could only ever
 * point at someone else's design files. Here a template is data we own — which also makes AI drafting
 * ("describe your post") and business-data merge (real products/prices into a design) possible later.
 *
 * India-first on purpose: festival sales, WhatsApp status, menu cards and GST-friendly invoicing
 * layouts are where Canva's library is thinnest, so this is where a small set is actually
 * differentiated rather than a worse copy of Canva's thousands.
 *
 * Fonts are Google Fonts already preloaded by index.html (no licensing cost, and the Indic families
 * matter for the Indian market).
 */

type FabricObject = Record<string, unknown>

const FONT_DISPLAY = 'Montserrat'
const FONT_BODY = 'Inter'
const FONT_SERIF = 'Playfair Display'

/** Fabric defaults that every object needs but which are noisy to repeat. */
function rect(o: {
  left: number
  top: number
  width: number
  height: number
  fill: string
  rx?: number
  opacity?: number
}): FabricObject {
  return {
    type: 'Rect',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    rx: o.rx ?? 0,
    ry: o.rx ?? 0,
    opacity: o.opacity ?? 1,
    strokeWidth: 0,
    ...o,
  }
}

function circle(o: { left: number; top: number; radius: number; fill: string; opacity?: number }): FabricObject {
  return {
    type: 'Circle',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    opacity: o.opacity ?? 1,
    strokeWidth: 0,
    ...o,
  }
}

function text(o: {
  text: string
  left: number
  top: number
  width: number
  fontSize: number
  fill: string
  fontFamily?: string
  fontWeight?: string | number
  textAlign?: string
  lineHeight?: number
  charSpacing?: number
}): FabricObject {
  return {
    type: 'Textbox',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    fontFamily: o.fontFamily ?? FONT_BODY,
    fontWeight: o.fontWeight ?? 'normal',
    textAlign: o.textAlign ?? 'left',
    lineHeight: o.lineHeight ?? 1.16,
    charSpacing: o.charSpacing ?? 0,
    splitByGrapheme: false,
    strokeWidth: 0,
    ...o,
  }
}

function doc(background: string, objects: FabricObject[]) {
  return { version: '6.0.0', background, objects }
}

export type SeedTemplate = {
  slug: string
  name: string
  category: string
  width: number
  height: number
  sortOrder: number
  canvas: ReturnType<typeof doc>
}

export const BUILTIN_TEMPLATES: SeedTemplate[] = [
  // ── Social ────────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'festival-sale-post',
    name: 'Festival Sale — Post',
    category: 'social',
    width: 1080,
    height: 1080,
    sortOrder: 10,
    canvas: doc('#3B1E54', [
      circle({ left: -140, top: -140, radius: 260, fill: '#F5A524', opacity: 0.22 }),
      circle({ left: 820, top: 760, radius: 300, fill: '#E8618C', opacity: 0.2 }),
      text({
        text: 'FESTIVAL SALE',
        left: 90,
        top: 250,
        width: 900,
        fontSize: 92,
        fill: '#FFFFFF',
        fontFamily: FONT_DISPLAY,
        fontWeight: 900,
        charSpacing: 40,
      }),
      rect({ left: 90, top: 380, width: 180, height: 8, fill: '#F5A524', rx: 4 }),
      text({
        text: 'UP TO 50% OFF',
        left: 90,
        top: 440,
        width: 900,
        fontSize: 130,
        fill: '#F5A524',
        fontFamily: FONT_DISPLAY,
        fontWeight: 800,
        lineHeight: 1.05,
      }),
      text({
        text: 'On all products · Limited period offer',
        left: 90,
        top: 720,
        width: 900,
        fontSize: 38,
        fill: '#E9E2F2',
      }),
      rect({ left: 90, top: 850, width: 430, height: 96, fill: '#F5A524', rx: 48 }),
      text({
        text: 'Shop Now',
        left: 90,
        top: 878,
        width: 430,
        fontSize: 40,
        fill: '#3B1E54',
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        textAlign: 'center',
      }),
    ]),
  },
  {
    slug: 'new-arrival-post',
    name: 'New Arrival — Post',
    category: 'social',
    width: 1080,
    height: 1080,
    sortOrder: 20,
    canvas: doc('#F7F3EC', [
      rect({ left: 60, top: 60, width: 960, height: 960, fill: '#FFFFFF', rx: 28 }),
      rect({ left: 120, top: 120, width: 840, height: 470, fill: '#E4DCCF', rx: 20 }),
      text({
        text: 'Add your product photo here',
        left: 120,
        top: 335,
        width: 840,
        fontSize: 30,
        fill: '#9C907C',
        textAlign: 'center',
      }),
      text({
        text: 'NEW ARRIVAL',
        left: 120,
        top: 640,
        width: 840,
        fontSize: 30,
        fill: '#B08549',
        fontWeight: 700,
        charSpacing: 120,
      }),
      text({
        text: 'Your product name',
        left: 120,
        top: 700,
        width: 840,
        fontSize: 78,
        fill: '#2A2118',
        fontFamily: FONT_SERIF,
        fontWeight: 700,
      }),
      text({
        text: '₹1,499  ·  Free delivery',
        left: 120,
        top: 820,
        width: 840,
        fontSize: 40,
        fill: '#6C6152',
      }),
    ]),
  },
  {
    slug: 'discount-story',
    name: 'Discount — Story',
    category: 'story',
    width: 1080,
    height: 1920,
    sortOrder: 30,
    canvas: doc('#0F766E', [
      circle({ left: 640, top: -180, radius: 340, fill: '#5EEAD4', opacity: 0.25 }),
      circle({ left: -220, top: 1480, radius: 380, fill: '#14B8A6', opacity: 0.35 }),
      text({
        text: 'TODAY ONLY',
        left: 100,
        top: 560,
        width: 880,
        fontSize: 46,
        fill: '#99F6E4',
        fontWeight: 700,
        charSpacing: 120,
      }),
      text({
        text: 'FLAT\n30% OFF',
        left: 100,
        top: 660,
        width: 880,
        fontSize: 170,
        fill: '#FFFFFF',
        fontFamily: FONT_DISPLAY,
        fontWeight: 900,
        lineHeight: 1.02,
      }),
      text({
        text: 'Use code SAVE30 at checkout',
        left: 100,
        top: 1080,
        width: 880,
        fontSize: 40,
        fill: '#CCFBF1',
      }),
      rect({ left: 100, top: 1240, width: 520, height: 110, fill: '#FFFFFF', rx: 55 }),
      text({
        text: 'Order on WhatsApp',
        left: 100,
        top: 1274,
        width: 520,
        fontSize: 38,
        fill: '#0F766E',
        fontWeight: 700,
        textAlign: 'center',
      }),
    ]),
  },
  {
    slug: 'whatsapp-status-offer',
    name: 'WhatsApp Status — Offer',
    category: 'story',
    width: 1080,
    height: 1920,
    sortOrder: 40,
    canvas: doc('#111827', [
      rect({ left: 0, top: 0, width: 1080, height: 620, fill: '#22C55E', opacity: 0.14 }),
      text({
        text: 'Special offer',
        left: 90,
        top: 700,
        width: 900,
        fontSize: 44,
        fill: '#4ADE80',
        fontWeight: 600,
        charSpacing: 60,
      }),
      text({
        text: 'Buy 1\nGet 1 Free',
        left: 90,
        top: 790,
        width: 900,
        fontSize: 140,
        fill: '#FFFFFF',
        fontFamily: FONT_DISPLAY,
        fontWeight: 800,
        lineHeight: 1.05,
      }),
      rect({ left: 90, top: 1170, width: 240, height: 6, fill: '#22C55E', rx: 3 }),
      text({
        text: 'Message us to order\n+91 00000 00000',
        left: 90,
        top: 1240,
        width: 900,
        fontSize: 44,
        fill: '#D1FAE5',
        lineHeight: 1.4,
      }),
    ]),
  },
  // ── Print ─────────────────────────────────────────────────────────────────────────────────────
  {
    slug: 'menu-card',
    name: 'Menu Card — A4',
    category: 'print',
    width: 1240,
    height: 1754,
    sortOrder: 50,
    canvas: doc('#FFFBF2', [
      rect({ left: 70, top: 70, width: 1100, height: 1614, fill: '#FFFFFF', rx: 8 }),
      text({
        text: 'MENU',
        left: 120,
        top: 150,
        width: 1000,
        fontSize: 96,
        fill: '#1F2937',
        fontFamily: FONT_SERIF,
        fontWeight: 700,
        textAlign: 'center',
        charSpacing: 120,
      }),
      rect({ left: 520, top: 290, width: 200, height: 4, fill: '#C2925A', rx: 2 }),
      text({
        text: 'Starters',
        left: 140,
        top: 380,
        width: 960,
        fontSize: 46,
        fill: '#C2925A',
        fontFamily: FONT_SERIF,
        fontWeight: 700,
      }),
      text({
        text: 'Paneer Tikka\nVeg Spring Roll\nMasala Papad',
        left: 140,
        top: 460,
        width: 700,
        fontSize: 38,
        fill: '#374151',
        lineHeight: 1.9,
      }),
      text({
        text: '₹220\n₹180\n₹90',
        left: 900,
        top: 460,
        width: 200,
        fontSize: 38,
        fill: '#374151',
        textAlign: 'right',
        lineHeight: 1.9,
      }),
      text({
        text: 'Main Course',
        left: 140,
        top: 760,
        width: 960,
        fontSize: 46,
        fill: '#C2925A',
        fontFamily: FONT_SERIF,
        fontWeight: 700,
      }),
      text({
        text: 'Dal Makhani\nPaneer Butter Masala\nVeg Biryani',
        left: 140,
        top: 840,
        width: 700,
        fontSize: 38,
        fill: '#374151',
        lineHeight: 1.9,
      }),
      text({
        text: '₹280\n₹340\n₹300',
        left: 900,
        top: 840,
        width: 200,
        fontSize: 38,
        fill: '#374151',
        textAlign: 'right',
        lineHeight: 1.9,
      }),
      text({
        text: 'Your restaurant name  ·  +91 00000 00000',
        left: 140,
        top: 1560,
        width: 960,
        fontSize: 30,
        fill: '#9CA3AF',
        textAlign: 'center',
      }),
    ]),
  },
  {
    slug: 'sale-flyer',
    name: 'Sale Flyer — Poster',
    category: 'print',
    width: 1080,
    height: 1350,
    sortOrder: 60,
    canvas: doc('#1D4ED8', [
      rect({ left: 0, top: 980, width: 1080, height: 370, fill: '#FFFFFF' }),
      text({
        text: 'GRAND\nOPENING',
        left: 80,
        top: 220,
        width: 920,
        fontSize: 150,
        fill: '#FFFFFF',
        fontFamily: FONT_DISPLAY,
        fontWeight: 900,
        lineHeight: 1.02,
      }),
      rect({ left: 80, top: 600, width: 560, height: 90, fill: '#FBBF24', rx: 45 }),
      text({
        text: 'Everything 40% off',
        left: 80,
        top: 626,
        width: 560,
        fontSize: 38,
        fill: '#1F2937',
        fontWeight: 700,
        textAlign: 'center',
      }),
      text({
        text: 'Visit us this weekend',
        left: 80,
        top: 760,
        width: 920,
        fontSize: 42,
        fill: '#DBEAFE',
      }),
      text({
        text: 'Your Business Name',
        left: 80,
        top: 1060,
        width: 920,
        fontSize: 56,
        fill: '#1D4ED8',
        fontFamily: FONT_DISPLAY,
        fontWeight: 800,
      }),
      text({
        text: 'Shop address, city  ·  +91 00000 00000',
        left: 80,
        top: 1150,
        width: 920,
        fontSize: 32,
        fill: '#4B5563',
      }),
    ]),
  },
  {
    slug: 'business-card',
    name: 'Business Card',
    category: 'print',
    width: 1050,
    height: 600,
    sortOrder: 70,
    canvas: doc('#FFFFFF', [
      rect({ left: 0, top: 0, width: 26, height: 600, fill: '#3B8FD6' }),
      text({
        text: 'Your Name',
        left: 90,
        top: 170,
        width: 700,
        fontSize: 62,
        fill: '#111827',
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
      }),
      text({
        text: 'Founder · Your Business',
        left: 92,
        top: 250,
        width: 700,
        fontSize: 30,
        fill: '#3B8FD6',
        fontWeight: 600,
        charSpacing: 40,
      }),
      rect({ left: 92, top: 320, width: 120, height: 4, fill: '#E5E7EB', rx: 2 }),
      text({
        text: '+91 00000 00000\nhello@yourbusiness.in\nyourbusiness.in',
        left: 92,
        top: 370,
        width: 700,
        fontSize: 26,
        fill: '#6B7280',
        lineHeight: 1.7,
      }),
    ]),
  },
  // ── Presentation ──────────────────────────────────────────────────────────────────────────────
  {
    slug: 'presentation-title',
    name: 'Presentation — Title 16:9',
    category: 'presentation',
    width: 1920,
    height: 1080,
    sortOrder: 80,
    canvas: doc('#0B1220', [
      circle({ left: 1450, top: -220, radius: 420, fill: '#3B8FD6', opacity: 0.18 }),
      rect({ left: 160, top: 380, width: 110, height: 10, fill: '#3B8FD6', rx: 5 }),
      text({
        text: 'Your presentation title',
        left: 160,
        top: 440,
        width: 1300,
        fontSize: 116,
        fill: '#FFFFFF',
        fontFamily: FONT_DISPLAY,
        fontWeight: 800,
        lineHeight: 1.1,
      }),
      text({
        text: 'Subtitle or short description goes here',
        left: 160,
        top: 700,
        width: 1200,
        fontSize: 44,
        fill: '#94A3B8',
      }),
      text({
        text: 'Your Business  ·  2026',
        left: 160,
        top: 900,
        width: 800,
        fontSize: 30,
        fill: '#64748B',
        charSpacing: 60,
      }),
    ]),
  },
]
