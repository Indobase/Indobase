import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import {
  Type,
  Square,
  Circle,
  Triangle,
  Minus,
  Upload,
  Palette,
  LayoutGrid,
  Sparkles,
  Layers,
  Paintbrush,
  Bot,
  Database,
  Wrench,
  Image,
  Search,
  ExternalLink,
} from "lucide-preact";
import { useEditor } from "../context";
import { DesignList } from "./design-list";
import { LayersPanel } from "./layers-panel";
import { BrandKitPanel } from "./brand-kit-panel";
import { AiDraftPanel } from "./ai-draft-panel";
import { DataMergePanel } from "./data-merge-panel";
import { ParityToolsPanel } from "./parity-tools-panel";
import { showToast } from "./toast";
import { labelForCategory, sortCategories } from "../utils/categories";
import { TemplateGrid } from "./template-grid";

type Section =
  | "templates"
  | "text"
  | "shapes"
  | "images"
  | "background"
  | "layers"
  | "brand"
  | "ai"
  | "merge"
  | "tools"
  | "designs";

/** Canva-like rail order: create content first, then brand/AI, then management. */
const SECTIONS: { key: Section; icon: typeof LayoutGrid; label: string }[] = [
  { key: "templates", icon: Sparkles, label: "Templates" },
  { key: "shapes", icon: Square, label: "Elements" },
  { key: "text", icon: Type, label: "Text" },
  { key: "images", icon: Image, label: "Uploads" },
  { key: "brand", icon: Paintbrush, label: "Brand" },
  { key: "background", icon: Palette, label: "Bg" },
  { key: "layers", icon: Layers, label: "Layers" },
  { key: "tools", icon: Wrench, label: "Tools" },
  { key: "ai", icon: Bot, label: "AI" },
  { key: "merge", icon: Database, label: "Data" },
  { key: "designs", icon: LayoutGrid, label: "Projects" },
];

const SECTION_TITLES: Record<Section, string> = {
  templates: "Templates",
  shapes: "Elements",
  text: "Text",
  images: "Photos & uploads",
  layers: "Layers",
  background: "Background",
  brand: "Brand kit",
  ai: "AI draft",
  merge: "Data merge",
  tools: "Design tools",
  designs: "Projects",
};

const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

const BG_COLORS = [
  "#1a1a2e", "#0f172a", "#18181b", "#1e1b4b",
  "#ffffff", "#f8fafc", "#fafaf9", "#fef3c7",
  "#2563eb", "#7c3aed", "#dc2626", "#059669",
  "#0891b2", "#d97706", "#e11d48", "#4f46e5",
];

export function LeftSidebar() {
  const { addText, addShape, addImage, setBackground, templates, loadTemplate, scheduleSave } =
    useEditor();
  const [activeSection, setActiveSection] = useState<Section | null>("templates");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recentAssets, setRecentAssets] = useState<Array<{ id: string; url: string }>>([]);
  const [stockQuery, setStockQuery] = useState("workspace");
  const [stockLoading, setStockLoading] = useState(false);
  const [stockImporting, setStockImporting] = useState<string | null>(null);
  const [stockResults, setStockResults] = useState<
    Array<{
      id: string;
      title: string;
      url: string;
      thumbnail: string;
      attribution: string;
      license: string;
      foreignLandingUrl: string | null;
    }>
  >([]);
  const [stockMeta, setStockMeta] = useState<{ resultCount: number; page: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const handleSectionClick = (key: Section) => {
    setActiveSection((prev) => (prev === key ? null : key));
  };

  const handleImageUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const form = new FormData();
          form.append("file", file);
          const resp = await fetch("/api/uploads", { method: "POST", body: form });
          const data = await resp.json();
          if (data.url) {
            addImage(data.url);
            scheduleSave?.();
          } else {
            showToast(data.error || "Upload failed", "error");
          }
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [addImage, scheduleSave]
  );

  const handleBgUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const form = new FormData();
      form.append("file", files[0]);
      try {
        const resp = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await resp.json();
        if (data.url) {
          setBackground("image", data.url);
          scheduleSave?.();
        } else {
          showToast(data.error || "Background upload failed", "error");
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Background upload failed", "error");
      }
    },
    [setBackground, scheduleSave]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      handleImageUpload(e.dataTransfer?.files ?? null);
    },
    [handleImageUpload]
  );

  const isOpen = activeSection !== null;
  const categories = sortCategories(Array.from(new Set(templates.map((t) => t.category))));
  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (!templateQuery.trim()) return true;
    const q = templateQuery.trim().toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      labelForCategory(t.category).toLowerCase().includes(q)
    );
  });

  const searchStock = useCallback(async (q: string, page = 1) => {
    const query = q.trim();
    if (!query) return;
    setStockLoading(true);
    try {
      const resp = await fetch(
        `/api/stock/search?q=${encodeURIComponent(query)}&page=${page}&page_size=24`
      );
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data.error || "Stock search failed", "error");
        return;
      }
      setStockResults(Array.isArray(data.results) ? data.results : []);
      setStockMeta({
        resultCount: Number(data.resultCount) || 0,
        page: Number(data.page) || page,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Stock search failed", "error");
    } finally {
      setStockLoading(false);
    }
  }, []);

  const importStock = useCallback(
    async (item: {
      id: string;
      url: string;
      title: string;
      attribution: string;
    }) => {
      setStockImporting(item.id);
      try {
        const resp = await fetch("/api/stock/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: item.url,
            title: item.title,
            attribution: item.attribution,
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.url) {
          showToast(data.error || "Could not add stock image", "error");
          return;
        }
        addImage(data.url);
        scheduleSave?.();
        if (data.attribution) {
          showToast("Added — keep license attribution when publishing", "success");
        } else {
          showToast("Stock image added", "success");
        }
        setRecentAssets((prev) => [{ id: String(data.id || item.id), url: data.url }, ...prev].slice(0, 12));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not add stock image", "error");
      } finally {
        setStockImporting(null);
      }
    },
    [addImage, scheduleSave]
  );

  useEffect(() => {
    if (activeSection !== "images") return;
    void fetch("/api/uploads")
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setRecentAssets(rows.filter((x: { url?: string }) => x.url));
      })
      .catch(() => undefined);
    if (stockResults.length === 0) {
      void searchStock(stockQuery || "workspace", 1);
    }
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside class="flex flex-row shrink-0 max-md:hidden">
      {/* Icon Rail */}
      <div class="w-[70px] bg-white border-r border-zinc-200 flex flex-col items-center pt-2 gap-0.5 shrink-0 overflow-y-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            class={`flex flex-col items-center justify-center gap-0.5 w-[56px] h-[52px] rounded-lg bg-transparent border-none cursor-pointer transition-all ${
              activeSection === s.key
                ? "text-accent bg-accent/10"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
            }`}
            onClick={() => handleSectionClick(s.key)}
          >
            <s.icon size={18} />
            <span class="text-[9px] leading-tight">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Content Panel */}
      <div
        class="bg-white border-r border-zinc-200 overflow-hidden transition-all duration-200 ease-in-out"
        style={{ width: isOpen ? "240px" : "0px" }}
      >
        <div class="w-[240px] h-full flex flex-col">
          {activeSection && (
            <>
              <div class="px-3 pt-3 pb-2 shrink-0">
                <h2 class="text-xs font-semibold text-zinc-800 uppercase tracking-wide m-0">
                  {SECTION_TITLES[activeSection]}
                </h2>
              </div>
              <div class="flex-1 overflow-y-auto px-3 pb-3">
                {activeSection === "templates" && (
                  <div>
                    <input
                      class="w-full mb-2 bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-[11px]"
                      placeholder="Search templates…"
                      value={templateQuery}
                      onInput={(e) => setTemplateQuery((e.target as HTMLInputElement).value)}
                    />
                    <div class="flex flex-wrap gap-1 mb-3">
                      <button
                        class={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                          categoryFilter === "all"
                            ? "bg-accent/10 border-accent text-accent"
                            : "bg-white border-zinc-200 text-zinc-500"
                        }`}
                        onClick={() => setCategoryFilter("all")}
                      >
                        All
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c}
                          class={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                            categoryFilter === c
                              ? "bg-accent/10 border-accent text-accent"
                              : "bg-white border-zinc-200 text-zinc-500"
                          }`}
                          onClick={() => setCategoryFilter(c)}
                        >
                          {labelForCategory(c)}
                        </button>
                      ))}
                    </div>
                    <p class="text-zinc-400 text-[11px] mb-2">
                      {filteredTemplates.length} templates — click to apply
                    </p>
                    <a
                      class="inline-flex items-center gap-1 text-[10px] text-accent mb-3 no-underline hover:underline"
                      href="https://www.slidescarnival.com/category/free-templates/canva-templates"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Free Canva/PPT packs on SlidesCarnival
                      <ExternalLink size={10} />
                    </a>
                    <TemplateGrid
                      templates={filteredTemplates}
                      pageSize={24}
                      columnsClass="grid grid-cols-2 gap-2"
                      onSelect={(t) => {
                        loadTemplate(t);
                        scheduleSave?.();
                        showToast(`Applied ${t.name}`, "success");
                      }}
                    />
                    {filteredTemplates.length === 0 && (
                      <p class="text-[11px] text-zinc-400">No templates match.</p>
                    )}
                  </div>
                )}

                {activeSection === "tools" && <ParityToolsPanel />}

                {activeSection === "brand" && <BrandKitPanel />}
                {activeSection === "ai" && <AiDraftPanel />}
                {activeSection === "merge" && <DataMergePanel />}

                {activeSection === "text" && (
                  <div class="flex flex-col gap-2">
                    <p class="text-zinc-400 text-[11px] mb-1">Click to add text</p>
                    <button
                      class="w-full text-left p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer transition-all hover:border-accent hover:bg-accent/5 group"
                      onClick={() => addText("heading")}
                    >
                      <span class="text-lg font-bold text-zinc-900 group-hover:text-accent transition-colors">
                        Add a heading
                      </span>
                      <span class="block text-[10px] text-zinc-400 mt-0.5">
                        Montserrat Bold, 48px
                      </span>
                    </button>
                    <button
                      class="w-full text-left p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer transition-all hover:border-accent hover:bg-accent/5 group"
                      onClick={() => addText("subheading")}
                    >
                      <span class="text-sm font-medium text-zinc-900 group-hover:text-accent transition-colors">
                        Add a subheading
                      </span>
                      <span class="block text-[10px] text-zinc-400 mt-0.5">
                        Inter Medium, 32px
                      </span>
                    </button>
                    <button
                      class="w-full text-left p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer transition-all hover:border-accent hover:bg-accent/5 group"
                      onClick={() => addText("body")}
                    >
                      <span class="text-xs text-zinc-900 group-hover:text-accent transition-colors">
                        Add body text
                      </span>
                      <span class="block text-[10px] text-zinc-400 mt-0.5">
                        Inter Regular, 18px
                      </span>
                    </button>
                  </div>
                )}

                {activeSection === "shapes" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">Click to add a shape</p>
                    <div class="grid grid-cols-2 gap-2">
                      {[
                        { type: "rect" as const, icon: Square, label: "Rectangle" },
                        { type: "circle" as const, icon: Circle, label: "Circle" },
                        { type: "triangle" as const, icon: Triangle, label: "Triangle" },
                        { type: "line" as const, icon: Minus, label: "Line" },
                      ].map((s) => (
                        <button
                          key={s.type}
                          class="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer transition-all hover:border-accent hover:bg-accent/5"
                          onClick={() => addShape(s.type)}
                        >
                          <s.icon size={24} class="text-zinc-400" />
                          <span class="text-[11px] text-zinc-400">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === "images" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">
                      Free CC stock via{" "}
                      <a
                        class="text-accent no-underline hover:underline"
                        href="https://api.openverse.org/v1/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Openverse
                      </a>
                    </p>
                    <div class="flex gap-1 mb-2">
                      <input
                        class="flex-1 bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1.5 text-[11px] min-w-0"
                        placeholder="Search stock photos…"
                        value={stockQuery}
                        onInput={(e) => setStockQuery((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void searchStock(stockQuery, 1);
                        }}
                      />
                      <button
                        class="shrink-0 px-2 rounded-md border border-zinc-200 bg-white cursor-pointer text-zinc-600 hover:border-accent hover:text-accent"
                        onClick={() => void searchStock(stockQuery, 1)}
                        title="Search"
                      >
                        <Search size={14} />
                      </button>
                    </div>
                    {stockLoading && (
                      <p class="text-[10px] text-zinc-400 mb-2">Searching Openverse…</p>
                    )}
                    {!stockLoading && stockMeta && (
                      <p class="text-[10px] text-zinc-400 mb-2">
                        {stockMeta.resultCount.toLocaleString()} commercial CC results
                      </p>
                    )}
                    <div class="grid grid-cols-2 gap-1.5 mb-3">
                      {stockResults.map((item) => (
                        <button
                          key={item.id}
                          class="relative aspect-square rounded border border-zinc-200 overflow-hidden p-0 cursor-pointer bg-zinc-50 disabled:opacity-60"
                          title={`${item.title}\n${item.attribution}`}
                          disabled={stockImporting === item.id}
                          onClick={() => void importStock(item)}
                        >
                          <img
                            src={item.thumbnail || item.url}
                            alt={item.title}
                            class="w-full h-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          {stockImporting === item.id && (
                            <span class="absolute inset-0 bg-black/40 text-white text-[9px] flex items-center justify-center">
                              Adding…
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {stockResults[0]?.attribution && (
                      <p class="text-[9px] text-zinc-400 mb-3 m-0 leading-snug">
                        Tap to add. Respect CC attribution (shown on hover).
                      </p>
                    )}

                    <p class="text-zinc-400 text-[11px] mb-2">Your uploads</p>
                    <div
                      class="border-2 border-dashed border-zinc-300 rounded-lg p-4 text-center cursor-pointer transition-all hover:border-accent/50 hover:bg-accent/5"
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <Upload size={20} class="text-zinc-400 mx-auto mb-1" />
                      <p class="text-xs text-zinc-400">
                        {uploading ? "Uploading..." : "Click or drag images"}
                      </p>
                      <p class="text-[10px] text-zinc-600 mt-1">PNG, JPG, SVG, WebP</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      class="hidden"
                      onChange={(e) => handleImageUpload((e.target as HTMLInputElement).files)}
                    />
                    {recentAssets.length > 0 && (
                      <div class="mt-3">
                        <p class="text-zinc-400 text-[11px] mb-2">Recent assets</p>
                        <div class="grid grid-cols-3 gap-1">
                          {recentAssets.slice(0, 12).map((a) => (
                            <button
                              key={a.id}
                              class="aspect-square rounded border border-zinc-200 overflow-hidden p-0 cursor-pointer bg-zinc-50"
                              onClick={() => addImage(a.url)}
                            >
                              <img src={a.url} alt="" class="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeSection === "background" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">Solid colors</p>
                    <div class="grid grid-cols-4 gap-1.5 mb-4">
                      {BG_COLORS.map((c) => (
                        <button
                          key={c}
                          class="w-full aspect-square rounded-md border border-zinc-300 cursor-pointer transition-all hover:scale-110 hover:border-accent"
                          style={{ background: c }}
                          onClick={() => setBackground("color", c)}
                        />
                      ))}
                    </div>

                    <p class="text-zinc-400 text-[11px] mb-2">Custom color</p>
                    <input
                      type="color"
                      class="w-full h-8 rounded-md border border-zinc-300 cursor-pointer bg-transparent"
                      onChange={(e) =>
                        setBackground("color", (e.target as HTMLInputElement).value)
                      }
                    />

                    <p class="text-zinc-400 text-[11px] mb-2 mt-4">Gradient presets</p>
                    <div class="grid grid-cols-3 gap-1.5 mb-4">
                      {GRADIENT_PRESETS.map((g, i) => (
                        <button
                          key={i}
                          class="w-full aspect-square rounded-md border border-zinc-300 cursor-pointer transition-all hover:scale-110 hover:border-accent"
                          style={{ background: g }}
                          onClick={() => {
                            const match = g.match(/#[0-9a-f]{6}/gi);
                            if (match) setBackground("color", match[0]);
                          }}
                        />
                      ))}
                    </div>

                    <p class="text-zinc-400 text-[11px] mb-2">Background image</p>
                    <button
                      class="w-full p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer text-xs text-zinc-400 hover:border-accent hover:text-zinc-800 transition-all"
                      onClick={() => bgFileRef.current?.click()}
                    >
                      <Upload size={14} class="inline mr-1.5" />
                      Upload image
                    </button>
                    <input
                      ref={bgFileRef}
                      type="file"
                      accept="image/*"
                      class="hidden"
                      onChange={(e) => handleBgUpload((e.target as HTMLInputElement).files)}
                    />
                  </div>
                )}

                {activeSection === "layers" && <LayersPanel />}

                {activeSection === "designs" && <DesignList />}
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
