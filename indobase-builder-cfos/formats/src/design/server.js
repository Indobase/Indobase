import { DurableObject } from "cloudflare:workers";

/**
 * Indobase Design — single-canvas graphic document.
 *
 * Storage key "design":
 *   {
 *     themeVersion: "indobase.design.1",
 *     title: string,
 *     preset: "ig-post" | "story" | "logo" | "poster" | "custom",
 *     width: number,
 *     height: number,
 *     background: { color: string },
 *     layers: [Layer],
 *   }
 *
 * Layer = {
 *   id: string,
 *   type: "text" | "rect" | "ellipse",
 *   x, y, w, h: number,
 *   props: { ...type-specific },
 * }
 *
 * Client owns rendering + PNG export; this DO is a dumb document store with
 * realtime broadcast (same pattern as Workspace Slides).
 */

const STORAGE_KEY = "design";
const MAX_UNDO = 50;
const SCHEMA = "indobase.design.1";

const PRESETS = {
  "ig-post": { width: 1080, height: 1080, label: "Instagram post" },
  story: { width: 1080, height: 1920, label: "Instagram story" },
  logo: { width: 512, height: 512, label: "Logo square" },
  poster: { width: 1080, height: 1350, label: "Poster" },
};

export class Gadget extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.subscribers = new Set();
    this.undoStack = [];
    this.redoStack = [];
  }

  async getUndoState() {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
  }

  async undo() {
    if (this.undoStack.length === 0) return false;
    const prev = this.undoStack.pop();
    const current = await this.state.storage.get(STORAGE_KEY);
    if (current) this.redoStack.push(current);
    await this.state.storage.put(STORAGE_KEY, prev);
    await this.#broadcast(prev);
    return true;
  }

  async redo() {
    if (this.redoStack.length === 0) return false;
    const next = this.redoStack.pop();
    const current = await this.state.storage.get(STORAGE_KEY);
    if (current) this.undoStack.push(current);
    await this.state.storage.put(STORAGE_KEY, next);
    await this.#broadcast(next);
    return true;
  }

  async getDesign() {
    let d = await this.state.storage.get(STORAGE_KEY);
    if (!d || !Array.isArray(d.layers) || d.themeVersion !== SCHEMA) {
      d = initialDesign();
      await this.state.storage.put(STORAGE_KEY, d);
    }
    return d;
  }

  /** Alias so agents that guess getDocument/getDeck still work. */
  async getDocument() {
    return this.getDesign();
  }

  async setDesign(design) {
    const next = normalizeDesign(design);
    await this.#save(next);
    return next;
  }

  async setDocument(design) {
    return this.setDesign(design);
  }

  async setPreset(presetId) {
    const d = await this.getDesign();
    const p = PRESETS[presetId];
    if (!p) return d;
    d.preset = presetId;
    d.width = p.width;
    d.height = p.height;
    await this.#save(d);
    return d;
  }

  async setBackground(color) {
    const d = await this.getDesign();
    d.background = { color: String(color || "#FFFFFF") };
    await this.#save(d);
    return d;
  }

  async setTitle(title) {
    const d = await this.getDesign();
    d.title = String(title || "Untitled design");
    await this.#save(d);
    return d;
  }

  async addLayer(layer, atIndex) {
    const d = await this.getDesign();
    const b = normalizeLayer(layer);
    if (atIndex == null || atIndex < 0 || atIndex > d.layers.length) {
      d.layers.push(b);
    } else {
      d.layers.splice(atIndex, 0, b);
    }
    await this.#save(d);
    return b.id;
  }

  async updateLayer(layerId, patch) {
    const d = await this.getDesign();
    const b = d.layers.find((l) => l.id === layerId);
    if (!b) return;
    if (patch.props) b.props = { ...b.props, ...patch.props };
    const { props, ...rest } = patch;
    Object.assign(b, rest);
    await this.#save(d);
  }

  async removeLayer(layerId) {
    const d = await this.getDesign();
    d.layers = d.layers.filter((l) => l.id !== layerId);
    await this.#save(d);
  }

  async reorderLayer(layerId, toIndex) {
    const d = await this.getDesign();
    const i = d.layers.findIndex((l) => l.id === layerId);
    if (i < 0) return;
    const [b] = d.layers.splice(i, 1);
    const j = Math.max(0, Math.min(d.layers.length, toIndex));
    d.layers.splice(j, 0, b);
    await this.#save(d);
  }

  async resetAll() {
    const d = initialDesign();
    await this.#save(d);
    return d;
  }

  async listPresets() {
    return Object.entries(PRESETS).map(([id, p]) => ({
      id,
      label: p.label,
      width: p.width,
      height: p.height,
    }));
  }

  /**
   * Prefer size + title from the user's request on first open.
   * Agents should call this right after createGadget(format.design).
   */
  async bootstrapFromPrompt(prompt, options = {}) {
    const text = String(prompt || "");
    const preset =
      (PRESETS[options.preset] && options.preset) || inferPreset(text) || "ig-post";
    const title =
      String(options.title || "").trim() ||
      inferTitle(text, preset) ||
      "Untitled design";
    let d = await this.getDesign();
    const p = PRESETS[preset];
    d.preset = preset;
    d.width = p.width;
    d.height = p.height;
    d.title = title;
    // Clear placeholder starter copy when bootstrapping from a real request.
    if (options.clearStarter !== false && looksLikeStarter(d)) {
      d.layers = starterLayersForPreset(preset, title);
      d.background = { color: preset === "logo" ? "#FFFFFF" : "#0B1220" };
    }
    await this.#save(d);
    return d;
  }

  async subscribe(cb) {
    const dup = cb.dup();
    this.subscribers.add(dup);
    dup.onRpcBroken(() => this.subscribers.delete(dup));
  }

  async #save(design) {
    const prev = await this.state.storage.get(STORAGE_KEY);
    if (prev) {
      this.undoStack.push(prev);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack = [];
    }
    await this.state.storage.put(STORAGE_KEY, design);
    await this.#broadcast(design);
  }

  async #broadcast(design) {
    const meta = {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
    for (const sub of this.subscribers) {
      try {
        sub.designChanged(design, meta);
      } catch {
        this.subscribers.delete(sub);
      }
    }
  }
}

function genId() {
  return crypto.randomUUID().slice(0, 8);
}

function normalizeLayer(layer) {
  const type = ["text", "rect", "ellipse"].includes(layer?.type)
    ? layer.type
    : "rect";
  return {
    id: layer?.id || genId(),
    type,
    x: Number(layer?.x) || 0,
    y: Number(layer?.y) || 0,
    w: Number(layer?.w) || (type === "text" ? 480 : 200),
    h: Number(layer?.h) || (type === "text" ? 80 : 200),
    props: { ...(layer?.props || {}) },
  };
}

function normalizeDesign(raw) {
  const preset = PRESETS[raw?.preset] ? raw.preset : "ig-post";
  const fallback = PRESETS[preset];
  const layers = Array.isArray(raw?.layers)
    ? raw.layers.map(normalizeLayer)
    : [];
  return {
    themeVersion: SCHEMA,
    title: String(raw?.title || "Untitled design"),
    preset,
    width: Number(raw?.width) || fallback.width,
    height: Number(raw?.height) || fallback.height,
    background: {
      color: String(raw?.background?.color || "#FFFFFF"),
    },
    layers,
  };
}

function inferPreset(text) {
  const t = text.toLowerCase();
  if (/\b(logo|logotype|wordmark|brand\s*mark)\b/.test(t)) return "logo";
  if (/\b(story|stories|reel)\b/.test(t) || /\big\s*story\b/.test(t)) return "story";
  if (/\b(poster|flyer|flier|banner)\b/.test(t)) return "poster";
  if (/\b(instagram|linkedin|facebook|social|ig\s*post|thumbnail|graphic|creative)\b/.test(t)) {
    return "ig-post";
  }
  return null;
}

function inferTitle(text, preset) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length <= 48) return cleaned;
  const label = PRESETS[preset]?.label || "Design";
  return `${label}`;
}

function looksLikeStarter(d) {
  if (!d?.layers?.length) return true;
  const texts = d.layers
    .filter((l) => l.type === "text")
    .map((l) => String(l.props?.text || ""));
  return texts.some((t) =>
    /your design|indobase design|ask the agent/i.test(t));
}

function starterLayersForPreset(preset, title) {
  const dark = preset !== "logo";
  const fg = dark ? "#FFFFFF" : "#0F172A";
  const muted = dark ? "#C9D8EA" : "#64748B";
  const mark = "#3B8FD6";
  if (preset === "logo") {
    return [
      {
        id: "mark1",
        type: "rect",
        x: 156,
        y: 156,
        w: 200,
        h: 200,
        props: { fill: mark, radius: 40 },
      },
      {
        id: "title1",
        type: "text",
        x: 56,
        y: 380,
        w: 400,
        h: 64,
        props: { text: title.slice(0, 32), fontSize: 36, weight: 700, color: fg, align: "center" },
      },
    ];
  }
  return [
    {
      id: "bgaccent1",
      type: "ellipse",
      x: Math.max(0, (PRESETS[preset]?.width || 1080) - 440),
      y: -120,
      w: 720,
      h: 720,
      props: { fill: mark, opacity: 0.35 },
    },
    {
      id: "title1",
      type: "text",
      x: 96,
      y: preset === "story" ? 720 : 360,
      w: (PRESETS[preset]?.width || 1080) - 192,
      h: 140,
      props: {
        text: title.slice(0, 64),
        fontSize: preset === "story" ? 72 : 84,
        weight: 700,
        color: fg,
        align: "left",
      },
    },
    {
      id: "sub1",
      type: "text",
      x: 96,
      y: preset === "story" ? 900 : 520,
      w: (PRESETS[preset]?.width || 1080) - 240,
      h: 80,
      props: {
        text: "Edit layers or ask the agent to refine this Design.",
        fontSize: 28,
        weight: 500,
        color: muted,
        align: "left",
      },
    },
  ];
}

function initialDesign() {
  return {
    themeVersion: SCHEMA,
    title: "Untitled design",
    preset: "ig-post",
    width: 1080,
    height: 1080,
    background: { color: "#0B1220" },
    layers: starterLayersForPreset("ig-post", "Your design"),
  };
}
