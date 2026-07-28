import { useState, useRef, useCallback, useEffect, useMemo } from "preact/hooks";
import {
  Type,
  Square,
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
  ChevronLeft,
  Shapes,
  Frame,
  Grid3x3,
  Sticker,
  Video,
  Music,
  Folder,
  FileImage,
} from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";
import { DesignList } from "./design-list";
import { LayersPanel } from "./layers-panel";
import { BrandKitPanel } from "./brand-kit-panel";
import { AiDraftPanel, AI_PROMPT_STORAGE_KEY } from "./ai-draft-panel";
import { DataMergePanel } from "./data-merge-panel";
import { ParityToolsPanel } from "./parity-tools-panel";
import { showToast } from "./toast";
import { labelForCategory, sortCategories } from "../utils/categories";
import { TemplateGrid } from "./template-grid";
import {
  ELEMENTS,
  ELEMENT_CATEGORIES,
  getElementsByCategory,
  type ElementCategory,
} from "../utils/elements";
import type { Template } from "../types";
import {
  OPEN_PANEL_EVENT,
  SECTION_EVENT,
  takeOpenPanelHint,
} from "../utils/home-handoff";

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

/** Editor invent rail order. */
const SECTIONS: { key: Section; icon: typeof LayoutGrid; label: string }[] = [
  { key: "templates", icon: Sparkles, label: "Templates" },
  { key: "shapes", icon: Square, label: "Elements" },
  { key: "text", icon: Type, label: "Text" },
  { key: "brand", icon: Paintbrush, label: "Brand" },
  { key: "images", icon: Image, label: "Uploads" },
  { key: "tools", icon: Wrench, label: "Tools" },
  { key: "designs", icon: LayoutGrid, label: "Projects" },
  { key: "ai", icon: Bot, label: "Magic" },
  { key: "background", icon: Palette, label: "Photos" },
  { key: "layers", icon: Layers, label: "Layers" },
  { key: "merge", icon: Database, label: "Apps" },
];

const SECTION_TITLES: Record<Section, string> = {
  templates: "Templates",
  shapes: "Elements",
  text: "Text",
  images: "Uploads",
  layers: "Layers",
  background: "Background",
  brand: "Brand kit",
  ai: "Magic Studio",
  merge: "Data merge",
  tools: "Design tools",
  designs: "Projects",
};

const RECENT_TEMPLATES_KEY = "indobase-design-recent-templates";

const OPEN_PANEL_ALIASES: Record<string, Section> = {
  templates: "templates",
  text: "text",
  elements: "shapes",
  shapes: "shapes",
  uploads: "images",
  images: "images",
  brand: "brand",
  ai: "ai",
  magic: "ai",
  tools: "tools",
  designs: "designs",
  projects: "designs",
  layers: "layers",
  background: "background",
  photos: "background",
  merge: "merge",
  apps: "merge",
};

const CATEGORY_ICONS: Record<ElementCategory, typeof Square> = {
  shapes: Shapes,
  graphics: Sparkles,
  frames: Frame,
  grids: Grid3x3,
  stickers: Sticker,
};

type UploadTab = "images" | "videos" | "audio" | "designs" | "folders";

const UPLOAD_TABS: { key: UploadTab; label: string; icon: typeof Image }[] = [
  { key: "images", label: "Images", icon: Image },
  { key: "videos", label: "Videos", icon: Video },
  { key: "audio", label: "Audio", icon: Music },
  { key: "designs", label: "Designs", icon: FileImage },
  { key: "folders", label: "Folders", icon: Folder },
];

function parseOpenPanel(value: string | null | undefined): Section | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return OPEN_PANEL_ALIASES[key] ?? null;
}

function readRecentTemplateIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecentTemplate(id: string) {
  const next = [id, ...readRecentTemplateIds().filter((x) => x !== id)].slice(0, 8);
  localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(next));
}

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
  const {
    addText,
    addImage,
    setBackground,
    templates,
    loadTemplate,
    scheduleSave,
    canvas,
    canvasWidth,
    canvasHeight,
  } = useEditor();
  const [activeSection, setActiveSection] = useState<Section | null>("templates");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateSearchApplied, setTemplateSearchApplied] = useState("");
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>(() => readRecentTemplateIds());
  const [elementCategory, setElementCategory] = useState<ElementCategory | null>(null);
  const [elementQuery, setElementQuery] = useState("");
  const [elementSearchApplied, setElementSearchApplied] = useState("");
  const [uploadTab, setUploadTab] = useState<UploadTab>("images");
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

  const openAiPanel = useCallback((prompt?: string) => {
    if (prompt?.trim()) {
      sessionStorage.setItem(AI_PROMPT_STORAGE_KEY, prompt.trim());
    }
    setActiveSection("ai");
  }, []);

  const applyTemplate = useCallback(
    (t: Template) => {
      loadTemplate(t);
      scheduleSave?.();
      pushRecentTemplate(t.id);
      setRecentTemplateIds(readRecentTemplateIds());
      showToast(`Applied ${t.name}`, "success");
    },
    [loadTemplate, scheduleSave]
  );

  const addElementToCanvas = useCallback(
    (elementId: string) => {
      if (!canvas) {
        showToast("Select a page first", "error");
        return;
      }
      const el = ELEMENTS.find((e) => e.id === elementId);
      if (!el) return;
      el.add(canvas, canvasWidth / 2, canvasHeight / 2);
      scheduleSave?.();
      showToast(`${el.label} added`, "success");
    },
    [canvas, canvasWidth, canvasHeight, scheduleSave]
  );

  const insertMagicWritePlaceholder = useCallback(() => {
    if (!canvas) {
      showToast("Select a page first", "error");
      return;
    }
    const text = new fabric.Textbox(
      "Your headline goes here\nAdd a compelling subheading that speaks to your audience.",
      {
        left: canvasWidth / 2 - 220,
        top: canvasHeight / 2 - 40,
        width: 440,
        fontSize: 28,
        fontWeight: "700",
        fontFamily: "Montserrat",
        fill: "#202124",
        textAlign: "center",
        editable: true,
        lineHeight: 1.25,
      }
    );
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    scheduleSave?.();
    showToast("Placeholder text added — open Magic for AI copy", "success");
  }, [canvas, canvasWidth, canvasHeight, scheduleSave]);

  const handleMagicWrite = useCallback(() => {
    const seed = templateQuery.trim() || "a social media post for my brand";
    openAiPanel(`Write a short headline and subheading for ${seed}. Keep it punchy and on-brand.`);
  }, [openAiPanel, templateQuery]);

  // Broadcast active section so draw palette / chrome can react (Tools → floating palette)
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SECTION_EVENT, { detail: { section: activeSection } })
    );
  }, [activeSection]);

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
    const q = templateSearchApplied.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      labelForCategory(t.category).toLowerCase().includes(q)
    );
  });

  const recentTemplates = useMemo(() => {
    const byId = new Map(templates.map((t) => [t.id, t]));
    return recentTemplateIds.map((id) => byId.get(id)).filter(Boolean) as Template[];
  }, [recentTemplateIds, templates]);

  const visibleElements = useMemo(() => {
    const q = elementSearchApplied.trim().toLowerCase();
    const pool = elementCategory ? getElementsByCategory(elementCategory) : ELEMENTS;
    if (!q) return pool;
    return pool.filter(
      (el) =>
        el.label.toLowerCase().includes(q) ||
        el.category.toLowerCase().includes(q) ||
        el.id.toLowerCase().includes(q)
    );
  }, [elementCategory, elementSearchApplied]);

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
    const stored = parseOpenPanel(takeOpenPanelHint());
    if (stored) setActiveSection(stored);

    const onOpenPanel = (event: Event) => {
      const detail = (event as CustomEvent<string | { panel?: string; section?: string }>).detail;
      const raw =
        typeof detail === "string"
          ? detail
          : detail?.panel ?? detail?.section ?? null;
      const target = parseOpenPanel(raw);
      if (target) setActiveSection(target);
    };

    window.addEventListener(OPEN_PANEL_EVENT, onOpenPanel);
    return () => window.removeEventListener(OPEN_PANEL_EVENT, onOpenPanel);
  }, []);

  useEffect(() => {
    if (activeSection !== "images" || uploadTab !== "images") return;
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
    <aside class="flex flex-row shrink-0 max-md:hidden h-full">
      {/* Icon Rail */}
      <div class="design-editor-rail">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            class={`design-editor-rail-btn ${
              activeSection === s.key ? "design-editor-rail-btn-active" : ""
            }`}
            onClick={() => handleSectionClick(s.key)}
          >
            <s.icon size={20} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Content Panel */}
      <div
        class="overflow-hidden transition-all duration-200 ease-in-out design-editor-panel"
        style={{ width: isOpen ? "328px" : "0px", borderRightWidth: isOpen ? "1px" : "0" }}
      >
        <div class="w-[328px] h-full flex flex-col">
          {activeSection && (
            <>
              <div class="px-4 pt-4 pb-2 shrink-0">
                <h2 class="text-[15px] font-bold text-[#202124] m-0 tracking-tight">
                  {SECTION_TITLES[activeSection]}
                </h2>
              </div>
              <div class="flex-1 overflow-y-auto px-4 pb-4">
                {activeSection === "templates" && (
                  <div>
                    <div class="mb-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
                      <input
                        class="w-full border-none outline-none bg-transparent text-[13px] text-[#202124]"
                        placeholder="Describe your ideal design"
                        value={templateQuery}
                        onInput={(e) => setTemplateQuery((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setTemplateSearchApplied(templateQuery);
                        }}
                      />
                      <div class="flex gap-2 mt-2">
                        <button
                          type="button"
                          class="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold border border-[#e5e7eb] bg-white text-[#3c4043] cursor-pointer hover:border-[#8b3dff]"
                          onClick={() => {
                            const q =
                              templateQuery.trim() ||
                              "a polished social media design for my brand";
                            openAiPanel(`Create a design layout for: ${q}`);
                          }}
                        >
                          <Sparkles size={13} class="text-[#8b3dff]" />
                          Generate
                        </button>
                        <button
                          type="button"
                          class="flex-1 py-2 rounded-lg text-[12px] font-semibold border-none bg-[#8b3dff] text-white cursor-pointer hover:bg-[#7a2eef]"
                          onClick={() => setTemplateSearchApplied(templateQuery)}
                        >
                          Search
                        </button>
                      </div>
                    </div>

                    {recentTemplates.length > 0 && (
                      <div class="mb-4">
                        <p class="text-[#9aa0a6] text-[12px] mb-2 m-0 font-semibold">Recently used</p>
                        <TemplateGrid
                          templates={recentTemplates}
                          pageSize={8}
                          columnsClass="grid grid-cols-2 gap-2"
                          onSelect={applyTemplate}
                        />
                      </div>
                    )}

                    <div class="flex flex-wrap gap-1.5 mb-3">
                      <button
                        type="button"
                        class={`px-2.5 py-1 rounded-full text-[11px] border cursor-pointer font-medium ${
                          categoryFilter === "all"
                            ? "bg-[#eee5ff] border-[#8b3dff] text-[#8b3dff]"
                            : "bg-white border-[#e5e7eb] text-[#5f6368]"
                        }`}
                        onClick={() => setCategoryFilter("all")}
                      >
                        All
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          class={`px-2.5 py-1 rounded-full text-[11px] border cursor-pointer font-medium ${
                            categoryFilter === c
                              ? "bg-[#eee5ff] border-[#8b3dff] text-[#8b3dff]"
                              : "bg-white border-[#e5e7eb] text-[#5f6368]"
                          }`}
                          onClick={() => setCategoryFilter(c)}
                        >
                          {labelForCategory(c)}
                        </button>
                      ))}
                    </div>
                    <p class="text-[#9aa0a6] text-[12px] mb-2 m-0">
                      {filteredTemplates.length} templates — click to apply
                    </p>
                    <a
                      class="inline-flex items-center gap-1 text-[11px] text-[#8b3dff] mb-3 no-underline hover:underline"
                      href="https://www.slidescarnival.com/category/free-templates"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Free presentation packs
                      <ExternalLink size={10} />
                    </a>
                    <TemplateGrid
                      templates={filteredTemplates}
                      pageSize={24}
                      columnsClass="grid grid-cols-2 gap-2"
                      onSelect={applyTemplate}
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
                    <button
                      type="button"
                      class="w-full py-3 rounded-xl text-[13px] font-semibold border-none cursor-pointer bg-[#8b3dff] text-white hover:bg-[#7a2eef] transition-colors"
                      onClick={() => addText("body")}
                    >
                      Add a text box
                    </button>
                    <button
                      type="button"
                      class="w-full py-2.5 rounded-xl text-[13px] font-semibold border border-[#e5e7eb] cursor-pointer bg-white text-[#3c4043] hover:border-[#8b3dff] transition-colors inline-flex items-center justify-center gap-1.5"
                      onClick={handleMagicWrite}
                      onDblClick={insertMagicWritePlaceholder}
                      title="Opens Magic Studio for AI copy (double-click for placeholder)"
                    >
                      <Sparkles size={14} class="text-[#8b3dff]" />
                      Magic Write
                    </button>
                    <p class="text-[#9aa0a6] text-[10px] m-0">
                      Magic Write opens Magic Studio. Double-click for a placeholder text box.
                    </p>
                    <p class="text-[#9aa0a6] text-[11px] mt-2 mb-1 m-0">Default text styles</p>
                    <button
                      type="button"
                      class="w-full text-left p-3 rounded-xl bg-white border border-[#e5e7eb] cursor-pointer transition-all hover:border-[#8b3dff] hover:shadow-sm group"
                      onClick={() => addText("heading")}
                    >
                      <span class="text-lg font-bold text-[#202124] group-hover:text-[#8b3dff] transition-colors">
                        Add a heading
                      </span>
                    </button>
                    <button
                      type="button"
                      class="w-full text-left p-3 rounded-xl bg-white border border-[#e5e7eb] cursor-pointer transition-all hover:border-[#8b3dff] hover:shadow-sm group"
                      onClick={() => addText("subheading")}
                    >
                      <span class="text-sm font-semibold text-[#202124] group-hover:text-[#8b3dff] transition-colors">
                        Add a subheading
                      </span>
                    </button>
                    <button
                      type="button"
                      class="w-full text-left p-3 rounded-xl bg-white border border-[#e5e7eb] cursor-pointer transition-all hover:border-[#8b3dff] hover:shadow-sm group"
                      onClick={() => addText("body")}
                    >
                      <span class="text-xs text-[#202124] group-hover:text-[#8b3dff] transition-colors">
                        Add a little bit of body text
                      </span>
                    </button>
                  </div>
                )}

                {activeSection === "shapes" && (
                  <div>
                    <div class="mb-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
                      <input
                        class="w-full border-none outline-none bg-transparent text-[13px] text-[#202124]"
                        placeholder="Search elements…"
                        value={elementQuery}
                        onInput={(e) => setElementQuery((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setElementSearchApplied(elementQuery);
                        }}
                      />
                      <div class="flex gap-2 mt-2">
                        <button
                          type="button"
                          class="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold border border-[#e5e7eb] bg-white text-[#3c4043] cursor-pointer hover:border-[#8b3dff]"
                          onClick={() => {
                            const q =
                              elementQuery.trim() ||
                              "decorative icons and shapes for a marketing design";
                            openAiPanel(`Suggest and describe elements for: ${q}`);
                          }}
                        >
                          <Sparkles size={13} class="text-[#8b3dff]" />
                          Generate
                        </button>
                        <button
                          type="button"
                          class="flex-1 py-2 rounded-lg text-[12px] font-semibold border-none bg-[#8b3dff] text-white cursor-pointer hover:bg-[#7a2eef]"
                          onClick={() => setElementSearchApplied(elementQuery)}
                        >
                          Search
                        </button>
                      </div>
                    </div>

                    {elementCategory ? (
                      <>
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 mb-3 text-[12px] font-semibold text-[#8b3dff] bg-transparent border-none cursor-pointer p-0"
                          onClick={() => {
                            setElementCategory(null);
                            setElementSearchApplied("");
                          }}
                        >
                          <ChevronLeft size={14} />
                          Browse categories
                        </button>
                        <p class="text-[#9aa0a6] text-[12px] mb-2 m-0 font-semibold">
                          {ELEMENT_CATEGORIES.find((c) => c.key === elementCategory)?.label}
                        </p>
                        <div class="grid grid-cols-3 gap-2">
                          {visibleElements.map((el) => (
                            <button
                              key={el.id}
                              type="button"
                              class="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white border border-[#e5e7eb] cursor-pointer transition-all hover:border-[#8b3dff] hover:shadow-sm"
                              onClick={() => addElementToCanvas(el.id)}
                            >
                              <span
                                class="w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                style={{
                                  background:
                                    ELEMENT_CATEGORIES.find((c) => c.key === el.category)?.color ??
                                    "#8b3dff",
                                }}
                              >
                                {el.label.slice(0, 2).toUpperCase()}
                              </span>
                              <span class="text-[10px] font-medium text-[#5f6368] text-center leading-tight">
                                {el.label}
                              </span>
                            </button>
                          ))}
                        </div>
                        {visibleElements.length === 0 && (
                          <p class="text-[11px] text-[#9aa0a6]">No elements match your search.</p>
                        )}
                      </>
                    ) : elementSearchApplied.trim() ? (
                      <>
                        <p class="text-[#9aa0a6] text-[12px] mb-2 m-0 font-semibold">
                          Search results
                        </p>
                        <div class="grid grid-cols-3 gap-2">
                          {visibleElements.map((el) => (
                            <button
                              key={el.id}
                              type="button"
                              class="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white border border-[#e5e7eb] cursor-pointer transition-all hover:border-[#8b3dff] hover:shadow-sm"
                              onClick={() => addElementToCanvas(el.id)}
                            >
                              <span class="text-[10px] font-medium text-[#5f6368] text-center leading-tight">
                                {el.label}
                              </span>
                              <span class="text-[9px] text-[#9aa0a6] capitalize">{el.category}</span>
                            </button>
                          ))}
                        </div>
                        {visibleElements.length === 0 && (
                          <p class="text-[11px] text-[#9aa0a6]">No elements match your search.</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p class="text-[#9aa0a6] text-[12px] mb-2 m-0 font-semibold">
                          Browse categories
                        </p>
                        <div class="grid grid-cols-2 gap-2">
                          {ELEMENT_CATEGORIES.map((cat) => {
                            const Icon = CATEGORY_ICONS[cat.key];
                            const count = getElementsByCategory(cat.key).length;
                            return (
                              <button
                                key={cat.key}
                                type="button"
                                class="flex flex-col items-start gap-1.5 p-3 rounded-xl bg-white border border-[#e5e7eb] cursor-pointer transition-all hover:border-[#8b3dff] hover:shadow-sm text-left"
                                onClick={() => {
                                  setElementCategory(cat.key);
                                  setElementSearchApplied("");
                                }}
                              >
                                <span
                                  class="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                                  style={{ background: cat.color }}
                                >
                                  <Icon size={20} />
                                </span>
                                <span class="text-[12px] font-semibold text-[#202124]">{cat.label}</span>
                                <span class="text-[10px] text-[#9aa0a6] leading-snug">
                                  {cat.description} · {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeSection === "images" && (
                  <div>
                    <button
                      type="button"
                      class="w-full py-3 rounded-xl text-[13px] font-semibold border-none cursor-pointer bg-[#8b3dff] text-white hover:bg-[#7a2eef] transition-colors mb-3"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload files
                    </button>

                    <div class="flex flex-wrap gap-1 mb-3">
                      {UPLOAD_TABS.map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          class={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border cursor-pointer font-medium ${
                            uploadTab === tab.key
                              ? "bg-[#eee5ff] border-[#8b3dff] text-[#8b3dff]"
                              : "bg-white border-[#e5e7eb] text-[#5f6368]"
                          }`}
                          onClick={() => setUploadTab(tab.key)}
                        >
                          <tab.icon size={12} />
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {uploadTab === "images" && (
                      <>
                        <p class="text-[#9aa0a6] text-[11px] mb-2 m-0">
                          Free CC stock via{" "}
                          <a
                            class="text-[#8b3dff] no-underline hover:underline"
                            href="https://api.openverse.org/v1/"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Openverse
                          </a>
                        </p>
                        <div class="flex gap-1 mb-2">
                          <input
                            class="flex-1 bg-[#f8f9fa] border border-[#e5e7eb] rounded-lg px-2 py-1.5 text-[11px] min-w-0 outline-none focus:border-[#8b3dff]"
                            placeholder="Search stock photos…"
                            value={stockQuery}
                            onInput={(e) => setStockQuery((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void searchStock(stockQuery, 1);
                            }}
                          />
                          <button
                            class="shrink-0 px-2 rounded-lg border border-[#e5e7eb] bg-white cursor-pointer text-[#5f6368] hover:border-[#8b3dff] hover:text-[#8b3dff]"
                            onClick={() => void searchStock(stockQuery, 1)}
                            title="Search"
                          >
                            <Search size={14} />
                          </button>
                        </div>
                        {stockLoading && (
                          <p class="text-[10px] text-[#9aa0a6] mb-2">Searching Openverse…</p>
                        )}
                        {!stockLoading && stockMeta && (
                          <p class="text-[10px] text-[#9aa0a6] mb-2">
                            {stockMeta.resultCount.toLocaleString()} commercial CC results
                          </p>
                        )}
                        <div class="grid grid-cols-2 gap-1.5 mb-3">
                          {stockResults.map((item) => (
                            <button
                              key={item.id}
                              class="relative aspect-square rounded-lg border border-[#e5e7eb] overflow-hidden p-0 cursor-pointer bg-[#f8f9fa] disabled:opacity-60"
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
                          <p class="text-[9px] text-[#9aa0a6] mb-3 m-0 leading-snug">
                            Tap to add. Respect CC attribution (shown on hover).
                          </p>
                        )}

                        <div
                          class="border border-dashed border-[#d1d5db] rounded-xl p-4 text-center cursor-pointer transition-all hover:border-[#8b3dff] hover:bg-[#eee5ff]/40 bg-white mb-3"
                          onClick={() => fileInputRef.current?.click()}
                          onDrop={handleDrop}
                          onDragOver={(e) => e.preventDefault()}
                        >
                          <Upload size={20} class="text-[#9aa0a6] mx-auto mb-1" />
                          <p class="text-xs text-[#5f6368] m-0">
                            {uploading ? "Uploading..." : "Click or drag images"}
                          </p>
                          <p class="text-[10px] text-[#9aa0a6] mt-1 m-0">PNG, JPG, SVG, WebP</p>
                        </div>

                        {recentAssets.length > 0 && (
                          <div>
                            <p class="text-[#9aa0a6] text-[11px] mb-2 m-0 font-semibold">Your uploads</p>
                            <div class="grid grid-cols-3 gap-1">
                              {recentAssets.slice(0, 12).map((a) => (
                                <button
                                  key={a.id}
                                  class="aspect-square rounded-lg border border-[#e5e7eb] overflow-hidden p-0 cursor-pointer bg-[#f8f9fa]"
                                  onClick={() => addImage(a.url)}
                                >
                                  <img src={a.url} alt="" class="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {uploadTab === "videos" && (
                      <div class="rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
                        <Video size={28} class="text-[#9aa0a6] mx-auto mb-2" />
                        <p class="text-[12px] font-semibold text-[#202124] m-0 mb-1">No videos yet</p>
                        <p class="text-[11px] text-[#9aa0a6] m-0">
                          Upload MP4 or WebM to use clips in your designs.
                        </p>
                      </div>
                    )}

                    {uploadTab === "audio" && (
                      <div class="rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
                        <Music size={28} class="text-[#9aa0a6] mx-auto mb-2" />
                        <p class="text-[12px] font-semibold text-[#202124] m-0 mb-1">No audio yet</p>
                        <p class="text-[11px] text-[#9aa0a6] m-0">
                          Upload MP3 or WAV for voiceovers and soundtracks.
                        </p>
                      </div>
                    )}

                    {uploadTab === "designs" && (
                      <div class="rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
                        <FileImage size={28} class="text-[#9aa0a6] mx-auto mb-2" />
                        <p class="text-[12px] font-semibold text-[#202124] m-0 mb-1">No imported designs</p>
                        <p class="text-[11px] text-[#9aa0a6] m-0">
                          Import PNG or PDF pages from other projects here soon.
                        </p>
                      </div>
                    )}

                    {uploadTab === "folders" && (
                      <div class="rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
                        <Folder size={28} class="text-[#9aa0a6] mx-auto mb-2" />
                        <p class="text-[12px] font-semibold text-[#202124] m-0 mb-1">No folders yet</p>
                        <p class="text-[11px] text-[#9aa0a6] m-0">
                          Organize uploads into folders to find assets faster.
                        </p>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      class="hidden"
                      onChange={(e) => handleImageUpload((e.target as HTMLInputElement).files)}
                    />
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
