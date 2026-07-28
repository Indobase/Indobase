import { useState, useEffect, useRef } from "preact/hooks";
import * as fabric from "fabric";
import type { Template } from "../types";
import { parseCanvasJson } from "../utils/canvas-json";
import { enqueueThumbRender } from "../utils/thumb-queue";
import { labelForCategory } from "../utils/categories";

interface Props {
  template: Template;
  onClick: () => void;
  /** Defer Fabric thumb until near viewport (home / large lists). */
  lazy?: boolean;
  /** Compact home-row cards (inspired / explore). */
  compact?: boolean;
}

export function TemplateCard({ template, onClick, lazy = true, compact = false }: Props) {
  const [preview, setPreview] = useState<string | null>(template.thumbnail_url);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(!lazy);
  const cancelled = useRef(false);
  const rootRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!lazy) return;
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazy]);

  useEffect(() => {
    cancelled.current = false;
    if (template.thumbnail_url) {
      setPreview(template.thumbnail_url);
      return;
    }
    if (!inView) return;

    setPreview(null);
    setFailed(false);

    const run = async () => {
      const el = document.createElement("canvas");
      const maxEdge = 480;
      const fit = Math.min(maxEdge / template.width, maxEdge / template.height, 1);
      const cw = Math.max(1, Math.round(template.width * fit));
      const ch = Math.max(1, Math.round(template.height * fit));

      const tempCanvas = new fabric.StaticCanvas(el, {
        width: cw,
        height: ch,
        renderOnAddRemove: false,
      });

      try {
        const parsed = parseCanvasJson(template.canvas_json);
        await tempCanvas.loadFromJSON(parsed);
        tempCanvas.setViewportTransform([fit, 0, 0, fit, 0, 0]);
        if (typeof parsed.background === "string") {
          tempCanvas.backgroundColor = parsed.background;
        }
        tempCanvas.requestRenderAll();
        const dataUrl = tempCanvas.toDataURL({ format: "png", multiplier: 1 });
        if (!cancelled.current) setPreview(dataUrl);
      } catch {
        if (!cancelled.current) setFailed(true);
      } finally {
        tempCanvas.dispose();
      }
    };

    void enqueueThumbRender(run);

    return () => {
      cancelled.current = true;
    };
  }, [template.id, template.width, template.height, template.thumbnail_url, template.canvas_json, inView]);

  return (
    <button
      ref={rootRef}
      type="button"
      class={`design-template-card group ${compact ? "design-template-card-compact" : ""}`}
      onClick={onClick}
      aria-label={`Use template ${template.name}`}
    >
      <div
        class="design-template-card-thumb"
        style={{ aspectRatio: `${template.width} / ${template.height}` }}
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            class="design-template-card-img"
            loading="lazy"
          />
        ) : (
          <span
            class={`absolute inset-0 flex items-center justify-center text-zinc-300 text-[10px] font-medium ${
              failed ? "" : "animate-pulse bg-zinc-100"
            }`}
          >
            {failed ? "Preview unavailable" : ""}
          </span>
        )}
        <span class="design-template-card-badge">
          {labelForCategory(template.category)}
        </span>
        <span class="design-template-card-overlay">
          <span class="design-template-card-cta">Use template</span>
        </span>
      </div>
      {!compact && (
        <div class="px-2 py-1.5 border-t border-zinc-100">
          <span class="text-[11px] text-zinc-700 font-medium truncate block">
            {template.name}
          </span>
          <span class="text-[9px] text-zinc-400">
            {template.width}&times;{template.height}
          </span>
        </div>
      )}
    </button>
  );
}
