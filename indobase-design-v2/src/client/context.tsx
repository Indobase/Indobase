import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Design, Template, Page } from "./types";
import type * as fabric from "fabric";

export interface CanvasSize {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_SIZES: CanvasSize[] = [
  { label: "Instagram Post", width: 1080, height: 1080 },
  { label: "Instagram Portrait", width: 1080, height: 1350 },
  { label: "Instagram Story / Reel", width: 1080, height: 1920 },
  { label: "TikTok", width: 1080, height: 1920 },
  { label: "Facebook Post", width: 1200, height: 630 },
  { label: "Facebook Cover", width: 820, height: 312 },
  { label: "LinkedIn Square", width: 1080, height: 1080 },
  { label: "LinkedIn Landscape", width: 1200, height: 627 },
  { label: "LinkedIn Portrait", width: 1200, height: 1500 },
  { label: "LinkedIn Cover", width: 1584, height: 396 },
  { label: "YouTube Thumbnail", width: 1280, height: 720 },
  { label: "Twitter / X Post", width: 1600, height: 900 },
  { label: "WhatsApp Status", width: 1080, height: 1920 },
  { label: "Presentation 16:9", width: 1920, height: 1080 },
  { label: "A4 Portrait", width: 1240, height: 1754 },
  { label: "US Letter", width: 1275, height: 1650 },
  { label: "Poster", width: 1080, height: 1350 },
  { label: "Business Card", width: 1050, height: 600 },
  { label: "Custom Square", width: 800, height: 800 },
];

export interface EditorContextValue {
  // Canvas (multi-canvas)
  registerCanvas: (pageId: string, canvas: fabric.Canvas) => void;
  unregisterCanvas: (pageId: string) => void;
  setActiveCanvas: (pageId: string) => void;
  activeCanvasId: string | null;
  canvas: fabric.Canvas | null;
  selectedObject: fabric.FabricObject | null;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  setZoomRaw: (z: number) => void;
  fitScale: number;
  setFitScale: (s: number) => void;

  // Canvas actions
  addText: (preset: "heading" | "subheading" | "body") => void;
  addShape: (type: "rect" | "circle" | "line" | "triangle") => void;
  addImage: (url: string) => Promise<boolean>;
  setBackground: (type: "color" | "gradient" | "image", value: string) => void;
  updateSelectedObject: (props: Record<string, unknown>) => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setCanvasSize: (width: number, height: number) => void;
  zoomToFit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  exportPNG: () => void;
  exportDesign: (
    format: "png" | "png-transparent" | "jpg" | "svg" | "pdf",
    designName?: string | null
  ) => void;
  bringForward: (obj?: fabric.FabricObject | null) => void;
  sendBackward: (obj?: fabric.FabricObject | null) => void;
  setLayerVisible: (obj: fabric.FabricObject, visible: boolean) => void;
  setLayerLocked: (obj: fabric.FabricObject, locked: boolean) => void;
  layersVersion: number;
  getCanvasJSON: () => string;
  getCanvasJSONForPage: (pageId: string) => string;
  loadTemplate: (template: Template) => void;
  loadCanvasDocument: (canvasJson: string) => void;
  applyBrandKit: (kit: import("./types").BrandKit) => void;

  // Router
  navigate: (to: string) => void;

  // Designs
  designs: Design[];
  activeDesign: Design | null;
  createDesign: (opts?: {
    width?: number;
    height?: number;
    name?: string;
  }) => Promise<string | undefined>;
  createFromTemplate: (template: Template) => Promise<string | undefined>;
  loadDesign: (id: string) => Promise<void>;
  saveDesign: () => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  saving: boolean;

  // Pages
  pages: Page[];
  activePageId: string | null;
  activePage: Page | null;
  // Upstream declared this as `() => Promise<void>`, but the implementation in use-designs.ts takes
  // an optional `afterPageId` and the "add page below" button passes one — so the insert-after path
  // failed to typecheck. Signature corrected to match the implementation.
  addPage: (afterPageId?: string) => Promise<void>;
  duplicatePage: (pageId: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  renamePage: (pageId: string, title: string) => Promise<void>;
  switchToPage: (pageId: string) => void;

  // Templates
  templates: Template[];

  // Autosave
  scheduleSave: () => void;

  // State
  loading: boolean;
}

export const EditorContext = createContext<EditorContextValue>(null!);

export function useEditor() {
  return useContext(EditorContext);
}
