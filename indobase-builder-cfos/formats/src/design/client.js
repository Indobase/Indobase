/* =========================================================================
 *  Indobase Design — canvas editor (v1)
 *  Layers: background color, text, rect, ellipse. Size presets + PNG export.
 * ========================================================================= */

const BRAND = "#3B8FD6";
const BRAND_HOVER = "#2F7AB8";

const PRESETS = [
  { id: "ig-post", label: "IG post", w: 1080, h: 1080 },
  { id: "story", label: "Story", w: 1080, h: 1920 },
  { id: "logo", label: "Logo", w: 512, h: 512 },
  { id: "poster", label: "Poster", w: 1080, h: 1350 },
];

const style = document.createElement("style");
style.textContent = `
:root {
  color-scheme: light;
  --bg: #f4f6f8;
  --surface: #ffffff;
  --line: rgba(15, 23, 42, 0.10);
  --text: #0f172a;
  --muted: #64748b;
  --brand: ${BRAND};
  --brand-hover: ${BRAND_HOVER};
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px; -webkit-font-smoothing: antialiased; }
button, input, select { font: inherit; }
.app { display: grid; grid-template-rows: 52px 1fr; height: 100vh; }
.topbar {
  display: flex; align-items: center; gap: 10px; padding: 0 14px;
  background: var(--surface); border-bottom: 1px solid var(--line);
}
.brand-dot { width: 12px; height: 12px; border-radius: 4px; background: var(--brand); flex: 0 0 auto; }
.title-input {
  border: 0; background: transparent; font-weight: 600; font-size: 14px;
  min-width: 160px; max-width: 280px; color: var(--text); outline: none;
}
.spacer { flex: 1; }
.btn {
  appearance: none; border: 1px solid var(--line); background: var(--surface);
  color: var(--text); border-radius: 8px; padding: 6px 10px; cursor: pointer;
}
.btn:hover { border-color: rgba(15,23,42,0.22); }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.btn.primary:hover { background: var(--brand-hover); border-color: var(--brand-hover); }
.btn:disabled { opacity: 0.45; cursor: default; }
.select {
  border: 1px solid var(--line); background: var(--surface); border-radius: 8px;
  padding: 6px 8px; color: var(--text);
}
.main { display: grid; grid-template-columns: 220px 1fr 260px; min-height: 0; }
.panel {
  background: var(--surface); border-right: 1px solid var(--line);
  overflow: auto; padding: 12px;
}
.panel.right { border-right: 0; border-left: 1px solid var(--line); }
.panel h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--muted); font-weight: 600; }
.tool-grid { display: grid; gap: 8px; }
.tool {
  text-align: left; border: 1px solid var(--line); background: #f8fafc;
  border-radius: 10px; padding: 10px 12px; cursor: pointer;
}
.tool:hover { border-color: var(--brand); background: #eef6fc; }
.tool strong { display: block; margin-bottom: 2px; }
.tool span { color: var(--muted); font-size: 12px; }
.stage-wrap {
  min-height: 0; overflow: auto; display: grid; place-items: center;
  padding: 28px; background:
    linear-gradient(180deg, #e8eef5 0%, #f4f6f8 40%, #f4f6f8 100%);
}
.stage-frame {
  position: relative; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
  border-radius: 4px; background: #fff; overflow: hidden;
}
.stage {
  position: relative; transform-origin: top left; user-select: none;
}
.layer {
  position: absolute; outline: 1px solid transparent; cursor: move;
}
.layer.selected { outline: 2px solid var(--brand); outline-offset: 1px; }
.layer.text {
  display: flex; align-items: center; white-space: pre-wrap; overflow: hidden;
  line-height: 1.2; word-break: break-word;
}
.layer.rect, .layer.ellipse { overflow: hidden; }
.layer.ellipse { border-radius: 50%; }
.handle {
  position: absolute; width: 10px; height: 10px; background: #fff;
  border: 2px solid var(--brand); border-radius: 2px; right: -5px; bottom: -5px;
  cursor: nwse-resize; z-index: 2;
}
.field { display: grid; gap: 4px; margin-bottom: 10px; }
.field label { color: var(--muted); font-size: 11px; font-weight: 600; }
.field input, .field select {
  border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px;
  background: #fff; color: var(--text);
}
.layer-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: 1px solid var(--line); background: #f8fafc; border-radius: 8px;
  padding: 8px 10px; margin-bottom: 6px; cursor: pointer; text-align: left;
}
.layer-row.active { border-color: var(--brand); background: #eef6fc; }
.hint { color: var(--muted); font-size: 12px; line-height: 1.45; }
.export-canvas { position: fixed; left: -99999px; top: 0; }
`;
document.head.appendChild(style);

let design = null;
let selectedId = null;
let canUndo = false;
let canRedo = false;
let scale = 0.5;

const root = document.createElement("div");
root.className = "app";
document.body.appendChild(root);

const exportCanvas = document.createElement("canvas");
exportCanvas.className = "export-canvas";
document.body.appendChild(exportCanvas);

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && v && typeof v === "object") Object.assign(node.style, v);
    else if (k === "className") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const kid of kids) node.append(kid);
  return node;
}

function currentLayer() {
  return design?.layers?.find((l) => l.id === selectedId) || null;
}

async function refreshUndo() {
  try {
    const s = await gadget.getUndoState();
    canUndo = !!s?.canUndo;
    canRedo = !!s?.canRedo;
  } catch {
    /* ignore */
  }
  const undoBtn = root.querySelector("[data-undo]");
  const redoBtn = root.querySelector("[data-redo]");
  if (undoBtn) undoBtn.disabled = !canUndo;
  if (redoBtn) redoBtn.disabled = !canRedo;
}

function fitScale() {
  if (!design) return 0.5;
  const wrap = root.querySelector(".stage-wrap");
  if (!wrap) return 0.5;
  const pad = 56;
  const sx = (wrap.clientWidth - pad) / design.width;
  const sy = (wrap.clientHeight - pad) / design.height;
  return Math.max(0.18, Math.min(1, Math.min(sx, sy)));
}

function mount() {
  root.innerHTML = "";
  const top = el("div", { className: "topbar" }, [
    el("div", { className: "brand-dot" }),
    el("input", {
      className: "title-input",
      value: design?.title || "Untitled design",
      onChange: async (e) => {
        await gadget.setTitle(e.target.value);
      },
    }),
    el("select", {
      className: "select",
      onChange: async (e) => {
        await gadget.setPreset(e.target.value);
      },
    }, PRESETS.map((p) => {
      const opt = el("option", { value: p.id }, [`${p.label} (${p.w}×${p.h})`]);
      if (design?.preset === p.id) opt.selected = true;
      return opt;
    })),
    el("div", { className: "spacer" }),
    el("button", {
      className: "btn",
      "data-undo": "1",
      disabled: !canUndo,
      onClick: async () => { try { await gadget.undo(); } catch {} },
    }, ["Undo"]),
    el("button", {
      className: "btn",
      "data-redo": "1",
      disabled: !canRedo,
      onClick: async () => { try { await gadget.redo(); } catch {} },
    }, ["Redo"]),
    el("button", {
      className: "btn primary",
      onClick: () => exportPng(),
    }, ["Export PNG"]),
  ]);

  const left = el("div", { className: "panel" }, [
    el("h3", {}, ["Add layer"]),
    el("div", { className: "tool-grid" }, [
      toolButton("Text", "Headline or caption", () => addLayer("text")),
      toolButton("Rectangle", "Filled shape", () => addLayer("rect")),
      toolButton("Ellipse", "Circle / oval", () => addLayer("ellipse")),
    ]),
    el("h3", { style: { marginTop: "18px" } }, ["Background"]),
    el("div", { className: "field" }, [
      el("label", {}, ["Color"]),
      el("input", {
        type: "color",
        value: normalizeHex(design?.background?.color || "#ffffff"),
        onChange: async (e) => { await gadget.setBackground(e.target.value); },
      }),
    ]),
    el("p", { className: "hint" }, [
      "Tip: ask the agent to create a logo, Instagram post, or poster. Or edit layers here and export PNG.",
    ]),
  ]);

  const stageWrap = el("div", { className: "stage-wrap" });
  const right = el("div", { className: "panel right" });
  root.append(top, el("div", { className: "main" }, [left, stageWrap, right]));
  renderStage(stageWrap);
  renderInspector(right);
  refreshUndo();
}

function toolButton(title, desc, onClick) {
  return el("button", { className: "tool", onClick }, [
    el("strong", {}, [title]),
    el("span", {}, [desc]),
  ]);
}

function normalizeHex(color) {
  const c = String(color || "#ffffff").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1], g = c[2], b = c[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#ffffff";
}

function renderStage(wrap) {
  wrap.innerHTML = "";
  if (!design) return;
  scale = fitScale();
  const frame = el("div", {
    className: "stage-frame",
    style: {
      width: `${design.width * scale}px`,
      height: `${design.height * scale}px`,
    },
  });
  const stage = el("div", {
    className: "stage",
    style: {
      width: `${design.width}px`,
      height: `${design.height}px`,
      transform: `scale(${scale})`,
      background: design.background?.color || "#fff",
    },
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.target === stage) {
      selectedId = null;
      mount();
    }
  });
  for (const layer of design.layers) {
    stage.append(renderLayer(layer));
  }
  frame.append(stage);
  wrap.append(frame);
}

function renderLayer(layer) {
  const node = el("div", {
    className: `layer ${layer.type}${layer.id === selectedId ? " selected" : ""}`,
    style: {
      left: `${layer.x}px`,
      top: `${layer.y}px`,
      width: `${layer.w}px`,
      height: `${layer.h}px`,
      opacity: layer.props?.opacity != null ? String(layer.props.opacity) : "1",
    },
  });

  if (layer.type === "text") {
    Object.assign(node.style, {
      color: layer.props?.color || "#0f172a",
      fontSize: `${layer.props?.fontSize || 48}px`,
      fontWeight: String(layer.props?.weight || 600),
      justifyContent:
        layer.props?.align === "center"
          ? "center"
          : layer.props?.align === "right"
            ? "flex-end"
            : "flex-start",
      textAlign: layer.props?.align || "left",
      padding: "4px 6px",
    });
    node.textContent = layer.props?.text || "Text";
  } else if (layer.type === "rect") {
    node.style.background = layer.props?.fill || BRAND;
    node.style.borderRadius = `${layer.props?.radius || 0}px`;
  } else if (layer.type === "ellipse") {
    node.style.background = layer.props?.fill || BRAND;
  }

  node.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    selectedId = layer.id;
    beginDrag(e, layer, "move");
    mount();
  });

  if (layer.id === selectedId) {
    const handle = el("div", { className: "handle" });
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      beginDrag(e, layer, "resize");
    });
    node.append(handle);
  }
  return node;
}

function beginDrag(e, layer, mode) {
  const startX = e.clientX;
  const startY = e.clientY;
  const ox = layer.x;
  const oy = layer.y;
  const ow = layer.w;
  const oh = layer.h;
  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / scale;
    const dy = (ev.clientY - startY) / scale;
    if (mode === "move") {
      layer.x = Math.round(ox + dx);
      layer.y = Math.round(oy + dy);
    } else {
      layer.w = Math.max(24, Math.round(ow + dx));
      layer.h = Math.max(24, Math.round(oh + dy));
    }
    const stage = root.querySelector(".stage");
    if (stage) renderStage(stage.parentElement.parentElement);
  };
  const onUp = async () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    await gadget.updateLayer(layer.id, {
      x: layer.x,
      y: layer.y,
      w: layer.w,
      h: layer.h,
    });
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function renderInspector(panel) {
  panel.innerHTML = "";
  panel.append(el("h3", {}, ["Layers"]));
  const list = el("div");
  const layers = [...(design?.layers || [])].reverse();
  for (const layer of layers) {
    const row = el("button", {
      className: `layer-row${layer.id === selectedId ? " active" : ""}`,
      onClick: () => { selectedId = layer.id; mount(); },
    }, [`${layer.type} · ${layer.id}`]);
    list.append(row);
  }
  panel.append(list);

  const layer = currentLayer();
  panel.append(el("h3", { style: { marginTop: "16px" } }, ["Inspector"]));
  if (!layer) {
    panel.append(el("p", { className: "hint" }, ["Select a layer to edit its properties."]));
    return;
  }

  panel.append(field("X", numberInput(layer.x, (v) => patchLayer({ x: v }))));
  panel.append(field("Y", numberInput(layer.y, (v) => patchLayer({ y: v }))));
  panel.append(field("W", numberInput(layer.w, (v) => patchLayer({ w: v }))));
  panel.append(field("H", numberInput(layer.h, (v) => patchLayer({ h: v }))));

  if (layer.type === "text") {
    panel.append(field("Text", el("input", {
      value: layer.props?.text || "",
      onChange: (e) => patchLayer({ props: { text: e.target.value } }),
    })));
    panel.append(field("Font size", numberInput(layer.props?.fontSize || 48, (v) => patchLayer({ props: { fontSize: v } }))));
    panel.append(field("Color", el("input", {
      type: "color",
      value: normalizeHex(layer.props?.color || "#ffffff"),
      onChange: (e) => patchLayer({ props: { color: e.target.value } }),
    })));
  } else {
    panel.append(field("Fill", el("input", {
      type: "color",
      value: normalizeHex(layer.props?.fill || BRAND),
      onChange: (e) => patchLayer({ props: { fill: e.target.value } }),
    })));
    if (layer.type === "rect") {
      panel.append(field("Radius", numberInput(layer.props?.radius || 0, (v) => patchLayer({ props: { radius: v } }))));
    }
  }

  panel.append(el("button", {
    className: "btn",
    style: { width: "100%", marginTop: "8px" },
    onClick: async () => {
      const id = layer.id;
      selectedId = null;
      await gadget.removeLayer(id);
    },
  }, ["Delete layer"]));
}

function field(label, control) {
  return el("div", { className: "field" }, [el("label", {}, [label]), control]);
}

function numberInput(value, onCommit) {
  return el("input", {
    type: "number",
    value: String(value ?? 0),
    onChange: (e) => onCommit(Number(e.target.value) || 0),
  });
}

async function patchLayer(patch) {
  if (!selectedId) return;
  await gadget.updateLayer(selectedId, patch);
}

async function addLayer(type) {
  if (!design) return;
  const base = {
    type,
    x: Math.round(design.width * 0.25),
    y: Math.round(design.height * 0.25),
    w: type === "text" ? Math.round(design.width * 0.5) : 240,
    h: type === "text" ? 100 : 240,
    props:
      type === "text"
        ? { text: "New text", fontSize: 56, weight: 700, color: "#FFFFFF", align: "left" }
        : { fill: BRAND, radius: type === "rect" ? 24 : 0, opacity: 1 },
  };
  const id = await gadget.addLayer(base);
  selectedId = id;
}

function paintToCanvas(ctx, doc) {
  ctx.clearRect(0, 0, doc.width, doc.height);
  ctx.fillStyle = doc.background?.color || "#ffffff";
  ctx.fillRect(0, 0, doc.width, doc.height);
  for (const layer of doc.layers) {
    ctx.save();
    ctx.globalAlpha = layer.props?.opacity != null ? Number(layer.props.opacity) : 1;
    if (layer.type === "rect") {
      const r = Number(layer.props?.radius) || 0;
      ctx.fillStyle = layer.props?.fill || BRAND;
      roundRect(ctx, layer.x, layer.y, layer.w, layer.h, r);
      ctx.fill();
    } else if (layer.type === "ellipse") {
      ctx.fillStyle = layer.props?.fill || BRAND;
      ctx.beginPath();
      ctx.ellipse(
        layer.x + layer.w / 2,
        layer.y + layer.h / 2,
        layer.w / 2,
        layer.h / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else if (layer.type === "text") {
      ctx.fillStyle = layer.props?.color || "#0f172a";
      ctx.font = `${layer.props?.weight || 600} ${layer.props?.fontSize || 48}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const align = layer.props?.align || "left";
      ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
      const tx =
        align === "center"
          ? layer.x + layer.w / 2
          : align === "right"
            ? layer.x + layer.w
            : layer.x;
      const lines = String(layer.props?.text || "").split("\n");
      const lineH = (layer.props?.fontSize || 48) * 1.2;
      lines.forEach((line, i) => ctx.fillText(line, tx, layer.y + i * lineH, layer.w));
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function exportPng() {
  if (!design) return;
  exportCanvas.width = design.width;
  exportCanvas.height = design.height;
  const ctx = exportCanvas.getContext("2d");
  paintToCanvas(ctx, design);
  const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(design.title || "design").replace(/[^\w.-]+/g, "_")}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

class Subscriber extends RpcTarget {
  designChanged(next, meta) {
    if (meta) {
      canUndo = !!meta.canUndo;
      canRedo = !!meta.canRedo;
    }
    design = next;
    if (selectedId && !design.layers.find((l) => l.id === selectedId)) {
      selectedId = null;
    }
    mount();
  }
}

(async () => {
  try {
    design = (await gadget.getDesign()) || null;
  } catch {
    design = null;
  }
  try {
    await gadget.subscribe(new Subscriber());
  } catch {
    /* ignore */
  }
  mount();
  window.addEventListener("resize", () => mount());
})();
