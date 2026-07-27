import { useState, useEffect, useRef } from "preact/hooks";
import * as fabric from "fabric";
import type { Template } from "../types";
import { parseCanvasJson } from "../utils/canvas-json";
import { enqueueThumbRender } from "../utils/thumb-queue";

interface Props {
  template: Template;
  onClick: () => void;
}

export function TemplateCard({ template, onClick }: Props) {
  const [preview, setPreview] = useState<string | null>(template.thumbnail_url);
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (template.thumbnail_url) {
      setPreview(template.thumbnail_url);
      return;
    }

    setPreview(null);
    setFailed(false);

    const run = async () => {
      const el = document.createElement("canvas");
      // Cap bitmap size so large decks (1920×1080) don't allocate huge canvases
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
        // Map design space → thumb canvas
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
  }, [template.id, template.width, template.height, template.thumbnail_url, template.canvas_json]);

  return (
    <button
      type="button"
      class="group relative bg-white border border-zinc-200 rounded-lg overflow-hidden cursor-pointer transition-all hover:border-accent hover:shadow-lg hover:shadow-accent/10 p-0"
      onClick={onClick}
    >
      <div
        class="w-full flex items-center justify-center bg-zinc-50 overflow-hidden"
        style={{ aspectRatio: `${template.width} / ${template.height}` }}
      >
        {preview ? (
          <img
            src={preview}
            alt={template.name}
            class="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <span class="text-zinc-300 text-[10px] font-medium">
            {failed ? "Preview unavailable" : "Loading…"}
          </span>
        )}
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
