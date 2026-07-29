import { Edit3, Trash2 } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Design } from "../types";
import { enqueueCanvasThumbnail } from "../utils/canvas-thumbnail";

interface Props {
  design: Design;
  onOpen: () => void;
  onRename: (id: string, name: string, e: Event) => void;
  onDelete: (id: string, e: Event) => void;
  editingId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  finishRename: () => void;
  setEditingId: (id: string | null) => void;
}

export function DesignRecentCard({
  design,
  onOpen,
  onRename,
  onDelete,
  editingId,
  editName,
  setEditName,
  finishRename,
  setEditingId,
}: Props) {
  const [preview, setPreview] = useState<string | null>(design.thumbnail_url);
  const cancelled = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (design.thumbnail_url) {
      setPreview(design.thumbnail_url);
      return;
    }
    if (!inView || !design.canvas_json || design.canvas_json === "{}") return;

    void enqueueCanvasThumbnail(design.canvas_json, design.width, design.height).then((url) => {
      if (!cancelled.current && url) setPreview(url);
    });

    return () => {
      cancelled.current = true;
    };
  }, [design.id, design.thumbnail_url, design.canvas_json, design.width, design.height, inView]);

  return (
    <div
      ref={rootRef}
      class="bg-white rounded-xl border border-zinc-200 overflow-hidden cursor-pointer transition-all hover:border-[#6366f1] hover:shadow-md group"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`Open design ${design.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div class="aspect-[4/3] bg-zinc-100 flex items-center justify-center overflow-hidden">
        {preview ? (
          <img src={preview} alt="" class="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div class="text-zinc-300 text-[10px] font-medium animate-pulse">
            {design.width} x {design.height}
          </div>
        )}
      </div>

      <div class="p-3">
        {editingId === design.id ? (
          <input
            class="w-full bg-zinc-100 border border-[#6366f1] rounded text-zinc-800 text-xs px-2 py-1 outline-none"
            value={editName}
            onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename();
              if (e.key === "Escape") setEditingId(null);
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            aria-label="Rename design"
          />
        ) : (
          <div class="flex items-start justify-between">
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-zinc-700 truncate m-0">{design.name}</p>
              <p class="text-[10px] text-zinc-400 mt-0.5 m-0">
                {design.width} x {design.height} &middot;{" "}
                {new Date(design.updated_at).toLocaleDateString()}
              </p>
            </div>
            <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
              <button
                type="button"
                class="min-h-[44px] min-w-[44px] p-2 rounded text-zinc-400 bg-transparent border-none cursor-pointer hover:text-zinc-700 transition-colors flex items-center justify-center"
                onClick={(e) => onRename(design.id, design.name, e)}
                aria-label={`Rename ${design.name}`}
              >
                <Edit3 size={12} />
              </button>
              <button
                type="button"
                class="min-h-[44px] min-w-[44px] p-2 rounded text-zinc-400 bg-transparent border-none cursor-pointer hover:text-red-400 transition-colors flex items-center justify-center"
                onClick={(e) => onDelete(design.id, e)}
                aria-label={`Delete ${design.name}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
