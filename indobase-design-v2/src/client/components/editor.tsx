import { useEffect } from "preact/hooks";
import { CanvasArea } from "./canvas-area";
import { Toolbar } from "./toolbar";
import { LeftSidebar } from "./left-sidebar";
import { RightSidebar } from "./right-sidebar";
import { PagesBar } from "./pages-bar";
import { FloatingToolbar } from "./floating-toolbar";
import { DrawToolsPalette } from "./draw-tools-palette";
import { useEditor } from "../context";
import {
  clearPendingUpload,
  peekPendingUpload,
  setPendingUpload,
} from "../utils/home-handoff";

/** Consumes home → editor session handoffs (pending upload only; panels live in left sidebar). */
function SessionContracts() {
  const { canvas, activeCanvasId, addImage, scheduleSave } = useEditor();

  // Consume pending upload once an active canvas is ready (claim immediately to avoid duplicates).
  useEffect(() => {
    if (!canvas || !activeCanvasId) return;
    const pending = peekPendingUpload();
    if (!pending?.url) return;

    clearPendingUpload();
    const payload = pending;
    let cancelled = false;

    const run = async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        const ok = await addImage(payload.url);
        if (ok) {
          scheduleSave?.();
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!cancelled) setPendingUpload(payload);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [canvas, activeCanvasId, addImage, scheduleSave]);

  return null;
}

export function Editor() {
  return (
    <div class="flex flex-col h-full w-full">
      <Toolbar />
      <div class="flex flex-1 min-h-0">
        <LeftSidebar />
        <div class="flex-1 flex flex-col min-w-0 design-editor-workspace">
          <CanvasArea />
          <PagesBar />
        </div>
        <RightSidebar />
      </div>
      <FloatingToolbar />
      <DrawToolsPalette />
      <SessionContracts />
    </div>
  );
}
