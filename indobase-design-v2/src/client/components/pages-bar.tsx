import { useState, useRef, useEffect } from "preact/hooks";
import * as fabric from "fabric";
import {
  Plus,
  MoreHorizontal,
  Copy,
  Trash2,
  Pencil,
  StickyNote,
  Timer,
  Maximize,
  LayoutGrid,
} from "lucide-preact";
import { useEditor } from "../context";
import type { Page } from "../types";
import { parseCanvasJson, canvasJsonKey } from "../utils/canvas-json";
import { enqueueThumbRender } from "../utils/thumb-queue";

function PageThumb({ page, width, height }: { page: Page; width: number; height: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const prevJsonRef = useRef<string>("");
  const cancelled = useRef(false);

  useEffect(() => {
    const key = canvasJsonKey(page.canvas_json);
    if (key === prevJsonRef.current) return;
    prevJsonRef.current = key;
    cancelled.current = false;

    const run = async () => {
      const el = document.createElement("canvas");
      const fit = Math.min(200 / width, 200 / height, 1);
      const cw = Math.max(1, Math.round(width * fit));
      const ch = Math.max(1, Math.round(height * fit));
      const sc = new fabric.StaticCanvas(el, { width: cw, height: ch, renderOnAddRemove: false });
      try {
        const parsed = parseCanvasJson(page.canvas_json);
        await sc.loadFromJSON(parsed);
        sc.setViewportTransform([fit, 0, 0, fit, 0, 0]);
        if (typeof parsed.background === "string") sc.backgroundColor = parsed.background;
        sc.requestRenderAll();
        const dataUrl = sc.toDataURL({ format: "png", multiplier: 1 });
        if (!cancelled.current) setSrc(dataUrl);
      } catch {
        /* leave empty thumb */
      } finally {
        sc.dispose();
      }
    };

    void enqueueThumbRender(run);
    return () => {
      cancelled.current = true;
    };
  }, [page.canvas_json, width, height]);

  return src ? (
    <img src={src} class="rounded w-full h-full object-cover" alt={page.title} />
  ) : (
    <div class="rounded w-full h-full bg-[#f1f3f4]" />
  );
}

function notesKey(designId: string) {
  return `indobase-design-notes:${designId}`;
}

function formatTimer(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PagesBar() {
  const {
    pages,
    activePageId,
    addPage,
    duplicatePage,
    deletePage,
    renamePage,
    switchToPage,
    setActiveCanvas,
    canvasWidth,
    canvasHeight,
    zoom,
    fitScale,
    setZoomRaw,
    zoomToFit,
    activeDesign,
  } = useEditor();
  const [showPages, setShowPages] = useState(true);
  const [menuPageId, setMenuPageId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [showTimer, setShowTimer] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const zoomPct = Math.round((zoom / (fitScale || 1)) * 100);

  useEffect(() => {
    if (!activeDesign?.id) {
      setNotes("");
      return;
    }
    try {
      setNotes(localStorage.getItem(notesKey(activeDesign.id)) || "");
    } catch {
      setNotes("");
    }
  }, [activeDesign?.id]);

  useEffect(() => {
    if (!showNotes) return;
    notesRef.current?.focus();
  }, [showNotes]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const persistNotes = (value: string) => {
    setNotes(value);
    if (!activeDesign?.id) return;
    try {
      localStorage.setItem(notesKey(activeDesign.id), value);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!menuPageId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPageId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuPageId]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const startRename = (pageId: string, currentTitle: string) => {
    setMenuPageId(null);
    setRenamingId(pageId);
    setRenameValue(currentTitle);
  };

  const finishRename = () => {
    if (renamingId && renameValue.trim()) {
      renamePage(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handlePageClick = (pageId: string) => {
    setActiveCanvas(pageId);
    switchToPage(pageId);
    const pageEl = document.querySelector(`[data-page-id="${pageId}"]`);
    if (pageEl) pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (pages.length === 0) return null;

  return (
    <div class="bg-white border-t border-[#e5e7eb] shrink-0">
      {showPages && (
        <div class="flex items-center gap-2 px-4 py-2.5 overflow-x-auto border-b border-[#f1f3f4]">
          {pages.map((page) => {
            const isActive = page.id === activePageId;
            return (
              <div key={page.id} class="relative flex-shrink-0 group">
                <div
                  class={`relative flex flex-col items-center gap-1 cursor-pointer border-2 rounded-lg p-1 transition-all bg-white ${
                    isActive
                      ? "border-[#8b3dff] shadow-sm"
                      : "border-[#e5e7eb] hover:border-[#c4b5fd]"
                  }`}
                  onClick={() => handlePageClick(page.id)}
                  style={{ width: 88 }}
                >
                  <div class="rounded w-full overflow-hidden" style={{ height: 50 }}>
                    <PageThumb page={page} width={canvasWidth} height={canvasHeight} />
                  </div>
                  <button
                    type="button"
                    class="absolute top-0.5 right-0.5 p-0.5 rounded bg-white/80 border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#f1f3f4]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuPageId(menuPageId === page.id ? null : page.id);
                    }}
                  >
                    <MoreHorizontal size={12} class="text-[#5f6368]" />
                  </button>
                </div>
                <div class="mt-0.5 text-center" style={{ width: 88 }}>
                  {renamingId === page.id ? (
                    <input
                      ref={renameRef}
                      class="w-full text-center text-[10px] text-[#202124] bg-[#f1f3f4] border border-[#8b3dff] rounded px-1 py-0 outline-none"
                      value={renameValue}
                      onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                      onBlur={finishRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span
                      class={`text-[10px] truncate block ${
                        isActive ? "text-[#202124] font-semibold" : "text-[#5f6368]"
                      }`}
                    >
                      {page.title}
                    </span>
                  )}
                </div>

                {menuPageId === page.id && (
                  <div
                    ref={menuRef}
                    class="absolute bottom-full left-0 mb-1 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-30 min-w-[130px] py-1"
                  >
                    <button
                      type="button"
                      class="w-full text-left px-3 py-1.5 text-xs text-[#3c4043] bg-transparent border-none cursor-pointer hover:bg-[#f1f3f4] flex items-center gap-2"
                      onClick={() => startRename(page.id, page.title)}
                    >
                      <Pencil size={12} />
                      Rename
                    </button>
                    <button
                      type="button"
                      class="w-full text-left px-3 py-1.5 text-xs text-[#3c4043] bg-transparent border-none cursor-pointer hover:bg-[#f1f3f4] flex items-center gap-2"
                      onClick={() => {
                        setMenuPageId(null);
                        duplicatePage(page.id);
                      }}
                    >
                      <Copy size={12} />
                      Duplicate
                    </button>
                    {pages.length > 1 && (
                      <button
                        type="button"
                        class="w-full text-left px-3 py-1.5 text-xs text-red-500 bg-transparent border-none cursor-pointer hover:bg-red-50 flex items-center gap-2"
                        onClick={() => {
                          setMenuPageId(null);
                          deletePage(page.id);
                        }}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            class="flex-shrink-0 flex items-center justify-center gap-1.5 h-[62px] px-4 rounded-lg border border-[#e5e7eb] bg-[#f8f9fa] cursor-pointer transition-all hover:border-[#8b3dff] hover:bg-[#eee5ff] text-[12px] font-semibold text-[#3c4043]"
            onClick={() => addPage()}
            title="Add page"
          >
            <Plus size={14} />
            Add page
          </button>
        </div>
      )}

      <div class="design-bottom-bar">
        <div class="flex items-center gap-1 relative">
          <button
            type="button"
            class={`design-editor-top-btn text-[12px] ${showNotes ? "bg-[#eee5ff] text-[#8b3dff]" : ""}`}
            onClick={() => {
              setShowNotes((v) => !v);
              setShowTimer(false);
            }}
          >
            <StickyNote size={14} />
            Notes
          </button>
          <button
            type="button"
            class={`design-editor-top-btn text-[12px] ${showTimer ? "bg-[#eee5ff] text-[#8b3dff]" : ""}`}
            onClick={() => {
              setShowTimer((v) => !v);
              setShowNotes(false);
            }}
          >
            <Timer size={14} />
            {timerRunning || timerSec > 0 ? formatTimer(timerSec) : "Timer"}
          </button>

          {showNotes && (
            <>
              <div class="fixed inset-0 z-20" onClick={() => setShowNotes(false)} />
              <div class="design-notes-popover z-30">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-[12px] font-semibold text-[#202124]">Design notes</span>
                  <span class="text-[10px] text-[#9aa0a6]">Saved locally</span>
                </div>
                <textarea
                  ref={notesRef}
                  class="design-notes-textarea"
                  placeholder="Jot ideas for this design…"
                  value={notes}
                  onInput={(e) => persistNotes((e.target as HTMLTextAreaElement).value)}
                  rows={5}
                />
              </div>
            </>
          )}

          {showTimer && (
            <>
              <div class="fixed inset-0 z-20" onClick={() => setShowTimer(false)} />
              <div class="design-timer-popover z-30">
                <div class="text-[28px] font-semibold tabular-nums text-[#202124] tracking-tight">
                  {formatTimer(timerSec)}
                </div>
                <div class="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    class="design-timer-action"
                    onClick={() => setTimerRunning((v) => !v)}
                  >
                    {timerRunning ? "Pause" : "Start"}
                  </button>
                  <button
                    type="button"
                    class="design-timer-action design-timer-action-muted"
                    onClick={() => {
                      setTimerRunning(false);
                      setTimerSec(0);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="text-[12px] text-[#5f6368] bg-transparent border-none cursor-pointer px-1"
              onClick={() => setZoomRaw(Math.max(0.05, zoom * 0.9))}
            >
              −
            </button>
            <input
              type="range"
              min={10}
              max={200}
              value={zoomPct}
              class="w-24 accent-[#8b3dff]"
              onInput={(e) => {
                const pct = Number((e.target as HTMLInputElement).value);
                setZoomRaw((fitScale || 1) * (pct / 100));
              }}
              aria-label="Zoom"
            />
            <span class="text-[12px] font-medium text-[#3c4043] tabular-nums w-10">{zoomPct}%</span>
            <button
              type="button"
              class="text-[12px] text-[#5f6368] bg-transparent border-none cursor-pointer px-1"
              onClick={() => setZoomRaw(Math.min(3, zoom * 1.1))}
            >
              +
            </button>
          </div>

          <button
            type="button"
            class="design-editor-top-btn text-[12px]"
            onClick={() => setShowPages((v) => !v)}
          >
            <LayoutGrid size={14} />
            Pages {(pages.findIndex((p) => p.id === activePageId) + 1) || 1} / {pages.length}
          </button>

          <button type="button" class="design-editor-top-btn" onClick={zoomToFit} title="Fit">
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
