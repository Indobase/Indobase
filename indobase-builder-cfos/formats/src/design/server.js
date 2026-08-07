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

function initialDesign() {
  return {
    themeVersion: SCHEMA,
    title: "Untitled design",
    preset: "ig-post",
    width: 1080,
    height: 1080,
    background: { color: "#0B1220" },
    layers: [
      {
        id: "bgaccent1",
        type: "ellipse",
        x: 640,
        y: -120,
        w: 720,
        h: 720,
        props: { fill: "#3B8FD6", opacity: 0.35 },
      },
      {
        id: "bgaccent2",
        type: "rect",
        x: -80,
        y: 780,
        w: 520,
        h: 420,
        props: { fill: "#2F7AB8", opacity: 0.45, radius: 48 },
      },
      {
        id: "title1",
        type: "text",
        x: 96,
        y: 360,
        w: 880,
        h: 120,
        props: {
          text: "Your design",
          fontSize: 96,
          weight: 700,
          color: "#FFFFFF",
          align: "left",
        },
      },
      {
        id: "sub1",
        type: "text",
        x: 96,
        y: 500,
        w: 780,
        h: 80,
        props: {
          text: "Ask the agent for a logo, Instagram post, or poster — or edit the canvas.",
          fontSize: 32,
          weight: 500,
          color: "#C9D8EA",
          align: "left",
        },
      },
      {
        id: "mark1",
        type: "rect",
        x: 96,
        y: 96,
        w: 72,
        h: 72,
        props: { fill: "#3B8FD6", radius: 16 },
      },
      {
        id: "brand1",
        type: "text",
        x: 188,
        y: 110,
        w: 400,
        h: 48,
        props: {
          text: "Indobase Design",
          fontSize: 28,
          weight: 600,
          color: "#FFFFFF",
          align: "left",
        },
      },
    ],
  };
}
