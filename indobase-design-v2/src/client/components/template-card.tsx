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
}

export function TemplateCard({ template, onClick, lazy = true }: Props) {
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
      class="group relative bg-white border border-zinc-200 rounded-lg overflow-hidden cursor-pointer transition-all hover:border-accent hover:shadow-lg hover:shadow-accent/10 p-0 text-left w-full"
      onClick={onClick}
      aria-label={`Use template ${template.name}`}
    >
      <div
        class="w-full flex items-center justify-center bg-zinc-50 overflow-hidden relative"
        style={{ aspectRatio: `${template.width} / ${template.height}` }}
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            class="w-full h-full object-contain"
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
        <span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-white/90 text-zinc-600 border border-zinc-200/80">
          {labelForCategory(template.category)}
        </span>
      </div>
      <div class="px-2 py-1.5 border-t border-zinc-200">
        <span class="text-[10px] text-zinc-600 font-medium truncate block">
          {template.name}
        </span>
        <span class="text-[9px] text-zinc-400">
          {template.width}&times;{template.height}
        </span>
      </div>
    </button>
  );
}
