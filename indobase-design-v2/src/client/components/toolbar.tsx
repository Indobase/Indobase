import { useState } from "preact/hooks";
import {
  Undo2,
  Redo2,
  Download,
  Save,
  ChevronDown,
  Cloud,
  BarChart3,
  MessageCircle,
  File,
  Pencil,
} from "lucide-preact";
import { useEditor, CANVAS_SIZES } from "../context";
import { showToast } from "./toast";

export function Toolbar() {
  const {
    canvasWidth,
    canvasHeight,
    setCanvasSize,
    undo,
    redo,
    canUndo,
    canRedo,
    zoom,
    fitScale,
    exportDesign,
    saveDesign,
    saving,
    activeDesign,
    renameDesign,
    navigate,
  } = useEditor();

  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const currentSize = CANVAS_SIZES.find(
    (s) => s.width === canvasWidth && s.height === canvasHeight
  );
  const sizeLabel = currentSize ? currentSize.label : `${canvasWidth} × ${canvasHeight}`;
  const zoomPct = Math.round((zoom / (fitScale || 1)) * 100);

  const startRename = () => {
    if (!activeDesign) return;
    setNameValue(activeDesign.name);
    setEditingName(true);
  };

  const finishRename = () => {
    if (activeDesign && nameValue.trim()) {
      renameDesign(activeDesign.id, nameValue.trim());
    }
    setEditingName(false);
  };

  const runExport = (format: "png" | "png-transparent" | "jpg" | "svg" | "pdf") => {
    try {
      exportDesign(format, activeDesign?.name);
      showToast(`Exported ${format.replace("-", " ").toUpperCase()}`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    }
    setShowExportMenu(false);
  };

  return (
    <div class="design-editor-top">
      <div class="flex items-center gap-0.5 min-w-0">
        <div class="relative">
          <button type="button" class="design-editor-top-btn" onClick={() => setShowFileMenu((v) => !v)}>
            <File size={15} />
            File
            <ChevronDown size={12} />
          </button>
          {showFileMenu && (
            <>
              <div class="fixed inset-0 z-20" onClick={() => setShowFileMenu(false)} />
              <div class="absolute top-full left-0 mt-1 z-30 min-w-[180px] rounded-lg border border-[#e5e7eb] bg-white shadow-lg py-1">
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-[13px] text-[#3c4043] bg-transparent border-none cursor-pointer hover:bg-[#f1f3f4]"
                  onClick={() => {
                    setShowFileMenu(false);
                    navigate("/");
                  }}
                >
                  Home
                </button>
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-[13px] text-[#3c4043] bg-transparent border-none cursor-pointer hover:bg-[#f1f3f4] disabled:opacity-50"
                  disabled={saving || !activeDesign}
                  onClick={() => {
                    setShowFileMenu(false);
                    void saveDesign();
                  }}
                >
                  Save
                </button>
                <div class="my-1 border-t border-[#f1f3f4]" />
                <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#9aa0a6]">
                  Export
                </div>
                {(
                  [
                    ["png", "PNG"],
                    ["png-transparent", "PNG transparent"],
                    ["jpg", "JPG"],
                    ["svg", "SVG"],
                    ["pdf", "PDF"],
                  ] as const
                ).map(([fmt, label]) => (
                  <button
                    key={fmt}
                    type="button"
                    class="w-full text-left px-3 py-1.5 text-[13px] text-[#3c4043] bg-transparent border-none cursor-pointer hover:bg-[#f1f3f4] flex items-center gap-2"
                    onClick={() => {
                      setShowFileMenu(false);
                      runExport(fmt);
                    }}
                  >
                    <Download size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div class="relative">
          <button
            type="button"
            class="design-editor-top-btn"
            onClick={() => setShowSizeDropdown(!showSizeDropdown)}
          >
            Resize
            <ChevronDown size={12} />
          </button>
          {showSizeDropdown && (
            <>
              <div class="fixed inset-0 z-20" onClick={() => setShowSizeDropdown(false)} />
              <div class="absolute top-full left-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-30 min-w-[220px] py-1 max-h-[320px] overflow-y-auto">
                <div class="px-3 py-1.5 text-[11px] font-semibold text-[#9aa0a6] uppercase tracking-wide">
                  {sizeLabel}
                </div>
                {CANVAS_SIZES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    class={`w-full text-left px-3 py-2 text-[13px] cursor-pointer border-none transition-colors ${
                      s.width === canvasWidth && s.height === canvasHeight
                        ? "bg-[#eee5ff] text-[#8b3dff]"
                        : "text-[#3c4043] bg-transparent hover:bg-[#f1f3f4]"
                    }`}
                    onClick={() => {
                      setCanvasSize(s.width, s.height);
                      setShowSizeDropdown(false);
                    }}
                  >
                    <span class="font-medium">{s.label}</span>
                    <span class="text-[#9aa0a6] ml-2 text-[11px]">
                      {s.width} × {s.height}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button type="button" class="design-editor-top-btn" title="Editing">
          <Pencil size={14} />
          Editing
          <ChevronDown size={12} />
        </button>

        <div class="w-px h-5 bg-[#e5e7eb] mx-1" />

        <button
          type="button"
          class="design-editor-top-btn disabled:opacity-30"
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          class="design-editor-top-btn disabled:opacity-30"
          onClick={redo}
          disabled={!canRedo}
          title="Redo"
        >
          <Redo2 size={16} />
        </button>

        <span
          class="inline-flex items-center gap-1 px-2 text-[12px] text-[#5f6368]"
          title={saving ? "Saving…" : "All changes saved"}
        >
          <Cloud size={15} class={saving ? "text-[#8b3dff]" : "text-[#34a853]"} />
        </span>
      </div>

      <div class="flex-1 min-w-0 flex justify-center px-3">
        {activeDesign &&
          (editingName ? (
            <input
              class="bg-[#f1f3f4] border border-[#8b3dff] rounded-lg px-3 py-1 text-[13px] text-[#202124] outline-none w-full max-w-md"
              value={nameValue}
              onInput={(e) => setNameValue((e.target as HTMLInputElement).value)}
              onBlur={finishRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishRename();
                if (e.key === "Escape") setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              class="bg-transparent border-none cursor-pointer text-[13px] font-semibold text-[#202124] truncate max-w-md hover:text-[#8b3dff]"
              onDblClick={startRename}
              title="Double-click to rename"
            >
              {activeDesign.name}
            </button>
          ))}
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-[11px] text-[#9aa0a6] font-medium tabular-nums w-9 text-right mr-1 hidden sm:inline">
          {zoomPct}%
        </span>

        <div
          class="w-8 h-8 rounded-full bg-[#34a853] text-white text-[11px] font-bold flex items-center justify-center"
          title="Account"
        >
          ID
        </div>

        <button type="button" class="design-editor-top-btn" title="Insights" aria-label="Insights">
          <BarChart3 size={16} />
        </button>
        <button type="button" class="design-editor-top-btn" title="Comments" aria-label="Comments">
          <MessageCircle size={16} />
        </button>

        <div class="design-share-assign">
          <div class="relative">
            <button
              type="button"
              class="design-editor-share"
              onClick={() => setShowExportMenu((v) => !v)}
            >
              Share
              <ChevronDown size={12} />
            </button>
            {showExportMenu && (
              <>
                <div class="fixed inset-0 z-20" onClick={() => setShowExportMenu(false)} />
                <div class="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-lg border border-[#e5e7eb] bg-white shadow-lg py-1">
                  {(
                    [
                      ["png", "Download PNG"],
                      ["png-transparent", "PNG transparent"],
                      ["jpg", "Download JPG"],
                      ["svg", "Download SVG"],
                      ["pdf", "Download PDF"],
                    ] as const
                  ).map(([fmt, label]) => (
                    <button
                      key={fmt}
                      type="button"
                      class="w-full text-left px-3 py-2 text-[13px] text-[#3c4043] bg-transparent border-none cursor-pointer hover:bg-[#f1f3f4] flex items-center gap-2"
                      onClick={() => runExport(fmt)}
                    >
                      <Download size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            class="design-editor-assign disabled:opacity-50"
            onClick={() => void saveDesign()}
            disabled={saving || !activeDesign}
          >
            {saving ? <span class="spinner !border-white/30 !border-t-white" /> : <Save size={14} />}
            {saving ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
