import { useState, useCallback, useMemo, useRef, useEffect } from "preact/hooks";
import {
  Plus,
  Trash2,
  Edit3,
  Search,
  Home as HomeIcon,
  Folder,
  LayoutTemplate,
  Crown,
  Sparkles,
  MoreHorizontal,
  Lock,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowUpDown,
  Grid3x3,
  List,
  GraduationCap,
  Presentation,
  Heart,
  Video,
  FileText,
  StickyNote,
  Table2,
  Globe,
  Upload,
  BookOpen,
  Layers,
  Shirt,
  HelpCircle,
  Monitor,
} from "lucide-preact";
import type { Design, Template } from "../types";
import { TemplateCard } from "./template-card";
import { TemplateGrid } from "./template-grid";
import { showToast } from "./toast";
import { inferDesignType, labelForCategory } from "../utils/categories";
import { setOpenPanel, setPendingUpload } from "../utils/home-handoff";

interface HomeProps {
  designs: Design[];
  templates: Template[];
  navigate: (to: string) => void;
  createDesign: (opts?: { width?: number; height?: number; name?: string }) => Promise<string | undefined>;
  deleteDesign: (id: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  createFromTemplate: (template: Template) => Promise<string | undefined>;
}

type HomeTab = "home" | "templates";
type RailNav = "home" | "projects" | "templates" | "brand" | "ai";
type OwnerFilter = "owner" | "shared";
type TypeFilter = "any" | "presentation" | "social" | "video" | "poster" | "doc" | "website" | "other";
type SortMode = "recent" | "oldest" | "name-asc" | "name-desc";
type ViewMode = "grid" | "list";

const SIZE_PRESETS: Array<{
  label: string;
  w: number;
  h: number;
  hint: string;
  color: string;
  icon: typeof Presentation;
}> = [
  { label: "Presentation", w: 1920, h: 1080, hint: "16:9", color: "#ff6a3d", icon: Presentation },
  { label: "Social media", w: 1080, h: 1080, hint: "1:1", color: "#ef4444", icon: Heart },
  { label: "Video", w: 1080, h: 1920, hint: "9:16", color: "#a855f7", icon: Video },
  { label: "Doc", w: 1240, h: 1754, hint: "A4", color: "#22c55e", icon: FileText },
  { label: "Whiteboard", w: 1920, h: 1080, hint: "Board", color: "#0d9488", icon: StickyNote },
  { label: "Sheet", w: 1920, h: 1080, hint: "Grid", color: "#3b82f6", icon: Table2 },
  { label: "Website", w: 1440, h: 900, hint: "Web", color: "#1d4ed8", icon: Globe },
  { label: "Poster", w: 1080, h: 1350, hint: "4:5", color: "#7c3aed", icon: LayoutTemplate },
  { label: "Custom size", w: 1080, h: 1080, hint: "Blank", color: "#9ca3af", icon: Plus },
];

const CATEGORY_RAIL: Array<{
  label: string;
  color: string;
  icon: typeof Presentation;
  category?: string;
  action?: "blank" | "upload";
  w?: number;
  h?: number;
}> = [
  { label: "Templates", color: "#8b5cf6", icon: LayoutTemplate, category: "all" },
  { label: "Magic Layers", color: "#6366f1", icon: Layers, category: "marketing" },
  { label: "Learn Grid", color: "#ec4899", icon: BookOpen, category: "education" },
  { label: "Presentation", color: "#f97316", icon: Monitor, category: "presentation", w: 1920, h: 1080 },
  { label: "Social media", color: "#ef4444", icon: Heart, category: "social", w: 1080, h: 1080 },
  { label: "Video", color: "#a855f7", icon: Video, category: "video", w: 1080, h: 1920 },
  { label: "Print Shop", color: "#7c3aed", icon: Shirt, category: "print" },
  { label: "Doc", color: "#22c55e", icon: FileText, category: "doc", w: 1240, h: 1754 },
  { label: "Whiteboard", color: "#0d9488", icon: StickyNote, category: "whiteboard", w: 1920, h: 1080 },
  { label: "Sheet", color: "#3b82f6", icon: Table2, category: "sheet", w: 1920, h: 1080 },
  { label: "Website", color: "#1e40af", icon: Globe, category: "website", w: 1440, h: 900 },
  { label: "Custom size", color: "#9ca3af", icon: Plus, action: "blank", w: 1080, h: 1080 },
  { label: "Upload", color: "#9ca3af", icon: Upload, action: "upload" },
];

const EXPLORE_CARDS: Array<{ label: string; bg: string; category: string }> = [
  { label: "Education Presentation", bg: "#ffe4d6", category: "presentation" },
  { label: "Worksheet", bg: "#e8e0ff", category: "education" },
  { label: "Mobile Video", bg: "#d6f5ee", category: "video" },
  { label: "Social post", bg: "#ffe0e8", category: "social" },
  { label: "Doc", bg: "#dceeff", category: "doc" },
  { label: "Poster", bg: "#fff3c4", category: "poster" },
];

const PROMO_BANNERS = [
  {
    title: "Create standout designs with love",
    gradient: "linear-gradient(135deg, #ffb4a2 0%, #ff8fab 55%, #f9a8d4 100%)",
    category: "social",
  },
  {
    title: "Welcome the season with a special design",
    gradient: "linear-gradient(135deg, #93c5fd 0%, #a78bfa 55%, #c4b5fd 100%)",
    category: "poster",
  },
];

const QUICK_CHIPS = [
  { label: "Learn Grid", color: "#ec4899", category: "education" },
  { label: "Social media", color: "#ef4444", category: "social" },
  { label: "Business", color: "#14b8a6", category: "marketing" },
  { label: "Video", color: "#a855f7", category: "video" },
];

const TYPE_FILTER_OPTIONS: Array<{ key: TypeFilter; label: string }> = [
  { key: "any", label: "Any type" },
  { key: "presentation", label: "Presentation" },
  { key: "social", label: "Social" },
  { key: "video", label: "Video" },
  { key: "poster", label: "Poster" },
  { key: "doc", label: "Doc" },
  { key: "website", label: "Website" },
  { key: "other", label: "Other" },
];

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
  { key: "recent", label: "Last edited" },
  { key: "oldest", label: "Oldest first" },
  { key: "name-asc", label: "Name A–Z" },
  { key: "name-desc", label: "Name Z–A" },
];

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
  const [tab, setTab] = useState<HomeTab>("home");
  const [rail, setRail] = useState<RailNav>("home");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("owner");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("any");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [openMenu, setOpenMenu] = useState<"owner" | "type" | "sort" | null>(null);
  const exploreRef = useRef<HTMLDivElement>(null);
  const inspiredRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (!filterBarRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

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

  const inspired = useMemo(() => {
    const fromDesigns = designs.filter((d) => d.thumbnail_url).slice(0, 10);
    if (fromDesigns.length >= 4) return fromDesigns;
    return templates.slice(0, 10);
  }, [designs, templates]);

  const recentDesigns = useMemo(() => {
    let list = [...designs];
    // All local designs are owned by the signed-in user; "Shared" is empty until sharing ships.
    if (ownerFilter === "shared") list = [];
    if (typeFilter !== "any") {
      list = list.filter((d) => inferDesignType(d.width, d.height) === typeFilter);
    }
    list.sort((a, b) => {
      if (sortMode === "name-asc") return a.name.localeCompare(b.name);
      if (sortMode === "name-desc") return b.name.localeCompare(a.name);
      const ta = new Date(a.updated_at).getTime();
      const tb = new Date(b.updated_at).getTime();
      return sortMode === "oldest" ? ta - tb : tb - ta;
    });
    return list;
  }, [designs, ownerFilter, typeFilter, sortMode]);

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

  const handleOpenPanelCreate = useCallback(
    async (panel: "brand" | "ai") => {
      setRail(panel);
      setOpenPanel(panel);
      setCreating(true);
      try {
        const id = await createDesign({
          name: panel === "brand" ? "Brand design" : "Design AI",
        });
        if (id) {
          navigate(`/design/${id}`);
        } else {
          showToast("Could not create design", "error");
        }
      } finally {
        setCreating(false);
      }
    },
    [createDesign, navigate]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setCreating(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await resp.json();
        if (!resp.ok || !data.url) {
          showToast(data.error || "Upload failed", "error");
          return;
        }
        const name = file.name.replace(/\.[^.]+$/, "") || "Upload";
        setPendingUpload({ url: data.url, name });
        const id = await createDesign({ name, width: 1080, height: 1080 });
        if (id) {
          showToast("Upload ready — opening editor", "success");
          navigate(`/design/${id}`);
        } else {
          showToast("Uploaded, but could not create design", "error");
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Upload failed", "error");
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

  const onCategoryClick = useCallback(
    async (item: (typeof CATEGORY_RAIL)[number]) => {
      if (item.action === "upload") {
        fileRef.current?.click();
        return;
      }
      if (item.action === "blank" && item.w && item.h) {
        await handleBlank(item.w, item.h, item.label);
        return;
      }
      if (item.category) {
        setTab("templates");
        setCategory(item.category === "all" ? "all" : item.category);
        setRail("templates");
      }
    },
    [handleBlank]
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

  const scrollRow = (ref: { current: HTMLDivElement | null }, dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  const showTemplatesView = tab === "templates" || rail === "templates" || query.trim().length > 0;
  const showProjectsOnly = rail === "projects";

  const typeFilterLabel =
    TYPE_FILTER_OPTIONS.find((o) => o.key === typeFilter)?.label ?? "Any type";
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortMode)?.label ?? "Last edited";

  return (
    <div class="design-home">
      <nav class="design-home-rail" aria-label="Design navigation">
        <button
          type="button"
          class="mb-3 flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer disabled:opacity-60"
          onClick={handleCreate}
          disabled={creating}
          title="Create"
        >
          <span class="w-11 h-11 rounded-full bg-white shadow-[0_2px_10px_rgba(139,61,255,0.25)] border border-[#eee5ff] flex items-center justify-center text-[#8b3dff]">
            <Plus size={22} strokeWidth={2.5} />
          </span>
          <span class="text-[10px] font-semibold text-[#5f6368]">Create</span>
        </button>

        {(
          [
            { key: "home" as const, label: "Home", Icon: HomeIcon },
            { key: "projects" as const, label: "Projects", Icon: Folder },
            { key: "templates" as const, label: "Templates", Icon: LayoutTemplate },
            { key: "brand" as const, label: "Brand", Icon: Crown },
            { key: "ai" as const, label: "Design AI", Icon: Sparkles },
          ] as const
        ).map(({ key, label, Icon }) => {
          const active = rail === key || (key === "home" && rail === "home" && tab === "home");
          return (
            <button
              key={key}
              type="button"
              class={`mb-0.5 w-[56px] py-2 rounded-2xl flex flex-col items-center gap-1 border-none cursor-pointer transition-colors ${
                active ? "bg-[#eee5ff] text-[#8b3dff]" : "bg-transparent text-[#5f6368] hover:bg-[#eeeef2]"
              }`}
              onClick={() => {
                if (key === "brand" || key === "ai") {
                  void handleOpenPanelCreate(key);
                  return;
                }
                setRail(key);
                if (key === "home") {
                  setTab("home");
                  setCategory("all");
                  setQuery("");
                }
                if (key === "templates") {
                  setTab("templates");
                }
              }}
            >
              <Icon size={20} />
              <span class="text-[10px] font-medium leading-tight">{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          class="mt-1 w-[56px] py-2 rounded-2xl flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer text-[#5f6368] hover:bg-[#eeeef2]"
          title="More"
          onClick={() =>
            showToast("More: use Templates, Brand kit, or Design AI from the rail.", "info")
          }
        >
          <MoreHorizontal size={20} />
          <span class="text-[10px] font-medium">More</span>
        </button>

        <div class="flex-1" />

        <div
          class="w-9 h-9 rounded-full bg-[#34a853] text-white text-[12px] font-bold flex items-center justify-center shadow-sm"
          title="Account"
        >
          ID
        </div>
      </nav>

      <div class="design-home-main">
        <header class="design-home-hero">
          <p class="text-center text-[11px] font-semibold tracking-[0.14em] uppercase text-[#6d28d9]/80 m-0 mb-2">
            Indobase Design
          </p>
          <h1 class="design-home-hero-title">What will you design today?</h1>

          <div class="flex justify-center gap-2 mt-5 mb-5">
            <button
              type="button"
              class={`design-pill-tab ${tab === "home" && !showTemplatesView ? "design-pill-tab-active" : "design-pill-tab-idle"}`}
              onClick={() => {
                setTab("home");
                setRail("home");
                setCategory("all");
                setQuery("");
              }}
            >
              <HomeIcon size={15} />
              Home
            </button>
            <button
              type="button"
              class={`design-pill-tab ${showTemplatesView ? "design-pill-tab-active" : "design-pill-tab-idle"}`}
              onClick={() => {
                setTab("templates");
                setRail("templates");
              }}
            >
              <LayoutTemplate size={15} />
              Templates
            </button>
          </div>

          <div class="design-search">
            <Search size={18} class="text-[#9aa0a6] shrink-0" />
            <input
              value={query}
              onInput={(e) => {
                setQuery((e.target as HTMLInputElement).value);
                if ((e.target as HTMLInputElement).value.trim()) setTab("templates");
              }}
              placeholder={showTemplatesView ? "Search millions of templates" : "Search anything"}
              aria-label="Search designs and templates"
            />
          </div>

          {!showTemplatesView && (
            <div class="flex justify-center flex-wrap gap-2 mt-4">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 border text-[12px] font-semibold cursor-pointer hover:bg-white transition-colors"
                  style={{ borderColor: `${chip.color}55`, color: chip.color }}
                  onClick={() => {
                    setCategory(chip.category);
                    setTab("templates");
                    setRail("templates");
                  }}
                >
                  <span class="w-2 h-2 rounded-full" style={{ background: chip.color }} />
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {!showTemplatesView && (
            <div class="flex justify-center flex-wrap gap-x-5 gap-y-4 mt-7 px-2">
              {CATEGORY_RAIL.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={creating}
                    class="flex flex-col items-center gap-2 bg-transparent border-none cursor-pointer disabled:opacity-60 min-w-[64px]"
                    onClick={() => void onCategoryClick(item)}
                  >
                    <span class="design-cat-icon" style={{ background: item.color }}>
                      <Icon size={22} />
                    </span>
                    <span class="text-[11px] font-medium text-[#3c4043] text-center leading-tight max-w-[72px]">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        <div class="px-8 py-7 max-w-[1280px] mx-auto">
          {showProjectsOnly ? (
            <section>
              <h2 class="text-[22px] font-bold text-[#0e1318] m-0 mb-4">Projects</h2>
              {designs.length === 0 ? (
                <p class="text-sm text-[#5f6368]">No projects yet — create one from Home.</p>
              ) : recentDesigns.length === 0 ? (
                <p class="text-sm text-[#5f6368]">No projects match these filters.</p>
              ) : (
                <RecentDesigns
                  designs={recentDesigns}
                  viewMode={viewMode}
                  editingId={editingId}
                  editName={editName}
                  setEditName={setEditName}
                  startRename={startRename}
                  finishRename={finishRename}
                  setEditingId={setEditingId}
                  navigate={navigate}
                  deleteDesign={deleteDesign}
                />
              )}
            </section>
          ) : showTemplatesView ? (
            <section>
              <div class="flex items-end justify-between gap-4 mb-5 flex-wrap">
                <div>
                  <h2 class="text-[22px] font-bold text-[#0e1318] m-0">Explore templates</h2>
                  <p class="text-[13px] text-[#5f6368] m-0 mt-1">
                    {filtered.length.toLocaleString()} templates
                    {category !== "all" ? ` · ${labelForCategory(category)}` : ""}
                  </p>
                </div>
                <div class="flex gap-2 flex-wrap">
                  {SIZE_PRESETS.slice(0, 6).map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        disabled={creating}
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#e5e7eb] bg-white text-[12px] font-semibold text-[#3c4043] cursor-pointer hover:border-[#8b3dff] hover:text-[#8b3dff] transition-colors disabled:opacity-60"
                        onClick={() => void handleBlank(p.w, p.h, p.label)}
                      >
                        <Icon size={13} style={{ color: p.color }} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {category === "all" && !query.trim() && (
                <>
                  <div class="mb-8">
                    <h3 class="text-[15px] font-bold text-[#0e1318] m-0 mb-3">Browse by type</h3>
                    <div class="design-hscroll-wrap">
                      <button
                        type="button"
                        class="design-hscroll-arrow design-hscroll-arrow-left"
                        onClick={() => scrollRow(exploreRef, -1)}
                        aria-label="Scroll left"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div class="design-hscroll px-1" ref={exploreRef}>
                        {EXPLORE_CARDS.map((card) => (
                          <button
                            key={card.label}
                            type="button"
                            class="design-explore-card"
                            style={{ background: card.bg }}
                            onClick={() => setCategory(card.category)}
                          >
                            <span class="text-[14px] font-bold text-[#1f2937] pr-2 leading-snug">
                              {card.label}
                            </span>
                            <GraduationCap size={28} class="text-black/20 shrink-0" />
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        class="design-hscroll-arrow design-hscroll-arrow-right"
                        onClick={() => scrollRow(exploreRef, 1)}
                        aria-label="Scroll right"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  <div class="mb-8">
                    <h3 class="text-[15px] font-bold text-[#0e1318] m-0 mb-3">Inspired by your designs</h3>
                    <div class="design-hscroll-wrap">
                      <button
                        type="button"
                        class="design-hscroll-arrow design-hscroll-arrow-left"
                        onClick={() => scrollRow(inspiredRef, -1)}
                        aria-label="Scroll left"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div class="design-hscroll px-1" ref={inspiredRef}>
                        {inspired.map((item) => {
                          const isDesign = "thumbnail_url" in item && "width" in item && "updated_at" in item;
                          if (isDesign) {
                            const d = item as Design;
                            return (
                              <button
                                key={d.id}
                                type="button"
                                class="design-inspired-card"
                                onClick={() => navigate(`/design/${d.id}`)}
                              >
                                <div class="aspect-[3/4] bg-[#f3f4f6]">
                                  {d.thumbnail_url ? (
                                    <img src={d.thumbnail_url} alt={d.name} class="w-full h-full object-cover" />
                                  ) : null}
                                </div>
                              </button>
                            );
                          }
                          const t = item as Template;
                          return (
                            <div key={t.id} class="w-[148px] shrink-0">
                              <TemplateCard compact template={t} onClick={() => handleTemplateClick(t)} />
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        class="design-hscroll-arrow design-hscroll-arrow-right"
                        onClick={() => scrollRow(inspiredRef, 1)}
                        aria-label="Scroll right"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              <TemplateGrid templates={filtered} onSelect={handleTemplateClick} pageSize={48} />
              {filtered.length === 0 && (
                <p class="text-sm text-[#5f6368] py-12 text-center">No templates match your search.</p>
              )}
            </section>
          ) : (
            <>
              <section class="mb-9">
                <h2 class="text-[15px] font-bold text-[#0e1318] m-0 mb-3">See what&apos;s new</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PROMO_BANNERS.map((banner) => (
                    <button
                      key={banner.title}
                      type="button"
                      class="design-promo-card"
                      style={{ background: banner.gradient }}
                      onClick={() => {
                        setCategory(banner.category);
                        setTab("templates");
                        setRail("templates");
                      }}
                    >
                      <span class="relative z-10 text-[18px] font-bold text-[#1f2937] leading-snug max-w-[70%]">
                        {banner.title}{" "}
                        <ChevronRight size={18} class="inline align-middle opacity-70" />
                      </span>
                      <div class="absolute right-4 bottom-0 w-[42%] h-[78%] rounded-t-xl bg-white/35 border border-white/50 shadow-inner" />
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <h2 class="text-[22px] font-bold text-[#0e1318] m-0">Recents</h2>
                  <div class="flex items-center gap-2" ref={filterBarRef}>
                    <div class="relative">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#e5e7eb] bg-white text-[12px] font-medium text-[#3c4043] cursor-pointer"
                        onClick={() => setOpenMenu(openMenu === "owner" ? null : "owner")}
                      >
                        {ownerFilter === "owner" ? "Owner" : "Shared"} <ChevronDown size={12} />
                      </button>
                      {openMenu === "owner" && (
                        <div class="design-filter-menu" role="listbox">
                          <button
                            type="button"
                            aria-selected={ownerFilter === "owner"}
                            onClick={() => {
                              setOwnerFilter("owner");
                              setOpenMenu(null);
                            }}
                          >
                            Owner
                          </button>
                          <button
                            type="button"
                            aria-selected={ownerFilter === "shared"}
                            onClick={() => {
                              setOwnerFilter("shared");
                              setOpenMenu(null);
                            }}
                          >
                            Shared with you
                          </button>
                        </div>
                      )}
                    </div>

                    <div class="relative">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#e5e7eb] bg-white text-[12px] font-medium text-[#3c4043] cursor-pointer"
                        onClick={() => setOpenMenu(openMenu === "type" ? null : "type")}
                      >
                        {typeFilterLabel} <ChevronDown size={12} />
                      </button>
                      {openMenu === "type" && (
                        <div class="design-filter-menu" role="listbox">
                          {TYPE_FILTER_OPTIONS.map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              aria-selected={typeFilter === opt.key}
                              onClick={() => {
                                setTypeFilter(opt.key);
                                setOpenMenu(null);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div class="relative">
                      <button
                        type="button"
                        class="w-8 h-8 rounded-full border border-[#e5e7eb] bg-white flex items-center justify-center text-[#5f6368] cursor-pointer"
                        aria-label={`Sort: ${sortLabel}`}
                        title={sortLabel}
                        onClick={() => setOpenMenu(openMenu === "sort" ? null : "sort")}
                      >
                        <ArrowUpDown size={14} />
                      </button>
                      {openMenu === "sort" && (
                        <div class="design-filter-menu right-0 left-auto" role="listbox">
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              aria-selected={sortMode === opt.key}
                              onClick={() => {
                                setSortMode(opt.key);
                                setOpenMenu(null);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      class="w-8 h-8 rounded-full border border-[#e5e7eb] bg-white flex items-center justify-center text-[#5f6368] cursor-pointer"
                      aria-label={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
                      onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
                    >
                      {viewMode === "grid" ? <Grid3x3 size={14} /> : <List size={14} />}
                    </button>
                  </div>
                </div>

                {designs.length === 0 ? (
                  <div class="text-center py-14">
                    <div class="w-16 h-16 rounded-2xl bg-[#f3f4f6] flex items-center justify-center mx-auto mb-4">
                      <Plus size={24} class="text-[#9aa0a6]" />
                    </div>
                    <p class="text-sm text-[#5f6368] mb-1 m-0">No designs yet</p>
                    <p class="text-xs text-[#9aa0a6] m-0 mb-4">
                      Pick a size above or start from a template.
                    </p>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer bg-[#8b3dff] text-white"
                      onClick={handleCreate}
                      disabled={creating}
                    >
                      <Plus size={15} />
                      Blank design
                    </button>
                  </div>
                ) : recentDesigns.length === 0 ? (
                  <p class="text-sm text-[#5f6368] py-8 text-center m-0">
                    No designs match these filters.
                  </p>
                ) : (
                  <RecentDesigns
                    designs={recentDesigns}
                    viewMode={viewMode}
                    editingId={editingId}
                    editName={editName}
                    setEditName={setEditName}
                    startRename={startRename}
                    finishRename={finishRename}
                    setEditingId={setEditingId}
                    navigate={navigate}
                    deleteDesign={deleteDesign}
                  />
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        class="hidden"
        onChange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) void handleUpload(file);
          (e.target as HTMLInputElement).value = "";
        }}
      />

      <button
        type="button"
        class="design-help-fab"
        title="Help"
        aria-label="Help"
        onClick={() =>
          showToast(
            "Indobase Design tips: start from Templates or Upload, open Brand for your kit, or Design AI for a draft. Search filters templates; Recents sorts your projects.",
            "info"
          )
        }
      >
        <HelpCircle size={22} />
      </button>
    </div>
  );
}

function RecentDesigns({
  designs,
  viewMode,
  editingId,
  editName,
  setEditName,
  startRename,
  finishRename,
  setEditingId,
  navigate,
  deleteDesign,
}: {
  designs: Design[];
  viewMode: ViewMode;
  editingId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  startRename: (id: string, name: string, e: Event) => void;
  finishRename: () => void;
  setEditingId: (id: string | null) => void;
  navigate: (to: string) => void;
  deleteDesign: (id: string) => Promise<void>;
}) {
  if (viewMode === "list") {
    return (
      <div class="design-recent-list">
        {designs.map((d) => (
          <div
            key={d.id}
            class="design-recent-list-row group"
            onClick={() => navigate(`/design/${d.id}`)}
          >
            <div class="w-14 h-10 rounded-md overflow-hidden bg-[#f3f4f6] shrink-0">
              {d.thumbnail_url ? (
                <img src={d.thumbnail_url} alt="" class="w-full h-full object-cover" />
              ) : (
                <div class="w-full h-full flex items-center justify-center text-[9px] text-[#9aa0a6]">
                  {d.width}×{d.height}
                </div>
              )}
            </div>
            <div class="min-w-0 flex-1">
              {editingId === d.id ? (
                <input
                  class="w-full max-w-xs bg-[#f1f3f4] border border-[#8b3dff] rounded-md text-[#202124] text-xs px-2 py-1 outline-none"
                  value={editName}
                  onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <p class="text-[13px] font-semibold text-[#202124] truncate m-0">{d.name}</p>
                  <p class="text-[11px] text-[#9aa0a6] m-0 mt-0.5">
                    {labelForCategory(inferDesignType(d.width, d.height))} · Edited{" "}
                    {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </>
              )}
            </div>
            <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                class="p-1.5 rounded text-[#9aa0a6] bg-transparent border-none cursor-pointer hover:text-[#202124]"
                onClick={(e) => startRename(d.id, d.name, e)}
                aria-label="Rename"
              >
                <Edit3 size={13} />
              </button>
              <button
                class="p-1.5 rounded text-[#9aa0a6] bg-transparent border-none cursor-pointer hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteDesign(d.id).then(() => showToast("Design deleted", "info"));
                }}
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {designs.map((d) => (
        <div
          key={d.id}
          class="design-recent-card group"
          onClick={() => navigate(`/design/${d.id}`)}
        >
          <div class="aspect-[4/3] bg-[#f3f4f6] relative">
            {d.thumbnail_url ? (
              <img src={d.thumbnail_url} alt={d.name} class="w-full h-full object-cover" />
            ) : (
              <div class="w-full h-full flex items-center justify-center text-[11px] text-[#9aa0a6] font-medium">
                {d.width} × {d.height}
              </div>
            )}
            <span class="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e8eaed]/95 text-[10px] font-semibold text-[#3c4043]">
              <Lock size={10} />
              Private
            </span>
          </div>

          <div class="p-2.5">
            {editingId === d.id ? (
              <input
                class="w-full bg-[#f1f3f4] border border-[#8b3dff] rounded-md text-[#202124] text-xs px-2 py-1 outline-none"
                value={editName}
                onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishRename();
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div class="flex items-start justify-between gap-1">
                <div class="min-w-0 flex-1">
                  <p class="text-[12px] font-semibold text-[#202124] truncate m-0">{d.name}</p>
                  <p class="text-[10px] text-[#9aa0a6] mt-0.5 m-0">
                    Edited {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    class="p-1 rounded text-[#9aa0a6] bg-transparent border-none cursor-pointer hover:text-[#202124]"
                    onClick={(e) => startRename(d.id, d.name, e)}
                    aria-label="Rename"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    class="p-1 rounded text-[#9aa0a6] bg-transparent border-none cursor-pointer hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteDesign(d.id).then(() => showToast("Design deleted", "info"));
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
