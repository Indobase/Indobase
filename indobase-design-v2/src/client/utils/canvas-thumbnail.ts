import * as fabric from "fabric";

import { parseCanvasJson } from "./canvas-json";
import { enqueueThumbRender } from "./thumb-queue";

/** Render Fabric canvas JSON to a PNG data URL for recents / save thumbnails. */
export async function renderCanvasThumbnail(
  canvasJson: string | Record<string, unknown>,
  width: number,
  height: number,
  maxEdge = 480
): Promise<string | null> {
  const el = document.createElement("canvas");
  const fit = Math.min(maxEdge / width, maxEdge / height, 1);
  const cw = Math.max(1, Math.round(width * fit));
  const ch = Math.max(1, Math.round(height * fit));

  const tempCanvas = new fabric.StaticCanvas(el, {
    width: cw,
    height: ch,
    renderOnAddRemove: false,
  });

  try {
    const parsed = parseCanvasJson(canvasJson);
    await tempCanvas.loadFromJSON(parsed);
    tempCanvas.setViewportTransform([fit, 0, 0, fit, 0, 0]);
    if (typeof parsed.background === "string") {
      tempCanvas.backgroundColor = parsed.background;
    }
    tempCanvas.requestRenderAll();
    return tempCanvas.toDataURL({ format: "png", multiplier: 1 });
  } catch {
    return null;
  } finally {
    tempCanvas.dispose();
  }
}

export function enqueueCanvasThumbnail(
  canvasJson: string | Record<string, unknown>,
  width: number,
  height: number
): Promise<string | null> {
  return enqueueThumbRender(() => renderCanvasThumbnail(canvasJson, width, height));
}
