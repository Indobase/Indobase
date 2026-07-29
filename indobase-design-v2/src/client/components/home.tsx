import { useState, useCallback, useMemo } from "preact/hooks";
import { Plus, Sparkles, Search } from "lucide-preact";
import type { Design, Template } from "../types";
import { DesignRecentCard } from "./design-recent-card";
import { TemplateCard } from "./template-card";
import { TemplateGrid } from "./template-grid";
import { showToast } from "./toast";
import { labelForCategory, sortCategories } from "../utils/categories";

interface HomeProps {
  designs: Design[];
  templates: Template[];
  navigate: (to: string) => void;
  createDesign: (opts?: { width?: number; height?: number; name?: string }) => Promise<string | undefined>;
  deleteDesign: (id: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  createFromTemplate: (template: Template) => Promise<string | undefined>;
}

const SIZE_PRESETS: Array<{ label: string; w: number; h: number; hint: string }> = [
  { label: "Instagram post", w: 1080, h: 1080, hint: "1:1" },
  { label: "Story / Reel", w: 1080, h: 1920, hint: "9:16" },
  { label: "Presentation", w: 1920, h: 1080, hint: "16:9" },
  { label: "YouTube thumb", w: 1280, h: 720, hint: "16:9" },
  { label: "LinkedIn cover", w: 1584, h: 396, hint: "Banner" },
  { label: "Poster", w: 1080, h: 1350, hint: "4:5" },
  { label: "A4 / Flyer", w: 1240, h: 1754, hint: "A4" },
  { label: "Business card", w: 1050, h: 600, hint: "Card" },
  { label: "Facebook ad", w: 1200, h: 628, hint: "1.91:1" },
  { label: "Logo", w: 1080, h: 1080, hint: "Square" },
];

const FEATURED_CATEGORIES = ["presentation", "social", "story", "youtube", "marketing", "poster"] as const;

export function Home({
  designs,
  templates,
  navigate,
  createDesign,
  deleteDesign,
  renameDesign,
  createFromTemplate,
}: HomeProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const categories = useMemo(
    () => sortCategories(Array.from(new Set(templates.map((t) => t.category)))),
    [templates]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        labelForCategory(t.category).toLowerCase().includes(q)
      );
    });
  }, [templates, category, query]);

  const featuredRows = useMemo(() => {
    if (category !== "all" || query.trim()) return [];
    return FEATURED_CATEGORIES.map((cat) => ({
      cat,
      items: templates.filter((t) => t.category === cat).slice(0, 12),
    })).filter((row) => row.items.length > 0);
  }, [templates, category, query]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const id = await createDesign();
      if (id) navigate(`/design/${id}`);
      else showToast("Could not create design", "error");
    } finally {
      setCreating(false);
    }
  }, [createDesign, navigate]);

  const handleBlank = useCallback(
    async (w: number, h: number, label: string) => {
      setCreating(true);
      try {
        const id = await createDesign({ width: w, height: h, name: label });
        if (id) {
          showToast(`Blank ${label} ready`, "success");
          navigate(`/design/${id}`);
        } else showToast("Could not create design", "error");
      } finally {
        setCreating(false);
      }
    },
    [createDesign, navigate]
  );

  const handleTemplateClick = useCallback(
    async (t: Template) => {
      setCreating(true);
      try {
        const id = await createFromTemplate(t);
        if (id) {
          showToast(`Created from ${t.name}`, "success");
          navigate(`/design/${id}`);
        } else {
          showToast("Could not create from template", "error");
        }
      } finally {
        setCreating(false);
      }
    },
    [createFromTemplate, navigate]
  );

  const startRename = (id: string, name: string, e: Event) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(name);
  };

  const finishRename = () => {
    if (editingId && editName.trim()) renameDesign(editingId, editName.trim());
    setEditingId(null);
  };

  return (
    <div class="min-h-full bg-[#F3F4F7]">
      <div class="bg-white border-b border-zinc-200">
        <div class="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p class="text-[11px] font-semibold tracking-wide uppercase text-[#6366f1] m-0 mb-0.5">
              Indobase Design
            </p>
            <h1 class="text-lg font-bold text-zinc-800 m-0">Create a design</h1>
            <p class="text-xs text-zinc-400 mt-0.5 m-0">
              {templates.length.toLocaleString()} templates · {designs.length} design
              {designs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer bg-[#6366f1] text-white hover:bg-[#5558e6] transition-all shadow-sm disabled:opacity-60"
            onClick={handleCreate}
            disabled={creating}
          >
            <Plus size={15} />
            {creating ? "Creating…" : "Blank design"}
          </button>
        </div>
      </div>

      <div class="max-w-6xl mx-auto px-6 py-6">
        {/* Size presets — Canva-like custom size row */}
        <section class="mb-8">
          <h2 class="text-sm font-semibold text-zinc-700 m-0 mb-3">Custom size</h2>
          <div class="flex gap-2 overflow-x-auto pb-1">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={creating}
                class="shrink-0 px-3 py-2 rounded-xl bg-white border border-zinc-200 text-left cursor-pointer hover:border-[#6366f1] hover:shadow-sm transition-all disabled:opacity-60"
                onClick={() => handleBlank(p.w, p.h, p.label)}
              >
                <span class="block text-[11px] font-semibold text-zinc-700">{p.label}</span>
                <span class="block text-[10px] text-zinc-400 mt-0.5">
                  {p.w}×{p.h} · {p.hint}
                </span>
              </button>
            ))}
          </div>
        </section>

        {templates.length > 0 && (
          <div class="mb-10">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <Sparkles size={14} class="text-[#6366f1]" />
              <h2 class="text-sm font-semibold text-zinc-700 m-0">Templates</h2>
              <div class="ml-auto relative min-w-[200px] max-w-xs flex-1">
                <Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  class="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-700 outline-none focus:border-[#6366f1]"
                  placeholder="Search templates…"
                  value={query}
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                  aria-label="Search templates"
                />
              </div>
            </div>

            <div class="flex flex-wrap gap-1.5 mb-4">
              <button
                type="button"
                class={`px-2.5 py-1 rounded-md text-[11px] border cursor-pointer ${
                  category === "all"
                    ? "bg-[#6366f1]/10 border-[#6366f1] text-[#6366f1]"
                    : "bg-white border-zinc-200 text-zinc-500"
                }`}
                onClick={() => setCategory("all")}
              >
                All ({templates.length})
              </button>
              {categories.map((c) => {
                const count = templates.filter((t) => t.category === c).length;
                return (
                  <button
                    key={c}
                    type="button"
                    class={`px-2.5 py-1 rounded-md text-[11px] border cursor-pointer ${
                      category === c
                        ? "bg-[#6366f1]/10 border-[#6366f1] text-[#6366f1]"
                        : "bg-white border-zinc-200 text-zinc-500"
                    }`}
                    onClick={() => setCategory(c)}
                  >
                    {labelForCategory(c)} ({count})
                  </button>
                );
              })}
            </div>

            {/* Featured category rows when browsing All */}
            {featuredRows.length > 0 && (
              <div class="space-y-6 mb-8">
                {featuredRows.map((row) => (
                  <div key={row.cat}>
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="text-xs font-semibold text-zinc-600 m-0">
                        {labelForCategory(row.cat)}
                      </h3>
                      <button
                        type="button"
                        class="text-[11px] text-[#6366f1] bg-transparent border-none cursor-pointer font-medium"
                        onClick={() => setCategory(row.cat)}
                      >
                        See all
                      </button>
                    </div>
                    <div class="flex gap-3 overflow-x-auto pb-2">
                      {row.items.map((t) => (
                        <div key={t.id} class="w-[140px] shrink-0">
                          <TemplateCard template={t} onClick={() => handleTemplateClick(t)} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold text-zinc-600 m-0">
                {category === "all" && !query.trim()
                  ? "Browse all"
                  : `${filtered.length} result${filtered.length !== 1 ? "s" : ""}`}
              </h3>
            </div>
            <TemplateGrid templates={filtered} onSelect={handleTemplateClick} pageSize={40} />
            {filtered.length === 0 && (
              <p class="text-xs text-zinc-400 py-8 text-center">No templates match your search.</p>
            )}
          </div>
        )}

        {designs.length === 0 ? (
          <div class="text-center py-12">
            <div class="w-16 h-16 rounded-2xl bg-zinc-200 flex items-center justify-center mx-auto mb-4">
              <Plus size={24} class="text-zinc-400" />
            </div>
            <p class="text-sm text-zinc-500 mb-1">No designs yet</p>
            <p class="text-xs text-zinc-400 mb-4">
              Pick a template or a blank size above. Brand kit, AI draft, and data merge live in the editor.
            </p>
          </div>
        ) : (
          <>
            <h2 class="text-sm font-semibold text-zinc-700 mb-3 m-0">Recent designs</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {designs.map((d) => (
                <DesignRecentCard
                  key={d.id}
                  design={d}
                  onOpen={() => navigate(`/design/${d.id}`)}
                  onRename={startRename}
                  onDelete={(id, e) => {
                    e.stopPropagation();
                    void deleteDesign(id).then(() => showToast("Design deleted", "info"));
                  }}
                  editingId={editingId}
                  editName={editName}
                  setEditName={setEditName}
                  finishRename={finishRename}
                  setEditingId={setEditingId}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
