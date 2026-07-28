import { useEffect, useState } from "preact/hooks";
import {
  MousePointer2,
  Pencil,
  PenTool,
  Minus,
  Highlighter,
  Type,
  Brush,
} from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";
import { SECTION_EVENT } from "../utils/home-handoff";

export type DrawTool =
  | "cursor"
  | "pencil"
  | "pen"
  | "line"
  | "highlighter"
  | "text"
  | "freeform";

const TOOLS: { id: DrawTool; icon: typeof Pencil; label: string }[] = [
  { id: "cursor", icon: MousePointer2, label: "Select" },
  { id: "pencil", icon: Pencil, label: "Pencil" },
  { id: "pen", icon: PenTool, label: "Pen" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "highlighter", icon: Highlighter, label: "Highlighter" },
  { id: "text", icon: Type, label: "Text" },
  { id: "freeform", icon: Brush, label: "Freeform" },
];

function applyBrush(
  canvas: fabric.Canvas,
  opts: { width: number; color: string; opacity?: number }
) {
  canvas.isDrawingMode = true;
  const brush = new fabric.PencilBrush(canvas);
  brush.width = opts.width;
  brush.color = opts.color;
  if (typeof opts.opacity === "number") {
    // Fabric brush color with alpha via rgba
    brush.color = opts.color;
  }
  canvas.freeDrawingBrush = brush;
  canvas.selection = false;
  canvas.defaultCursor = "crosshair";
}

function exitDrawing(canvas: fabric.Canvas) {
  canvas.isDrawingMode = false;
  canvas.selection = true;
  canvas.defaultCursor = "default";
}

export function DrawToolsPalette() {
  const { canvas, addText, addShape, scheduleSave } = useEditor();
  const [visible, setVisible] = useState(false);
  const [tool, setTool] = useState<DrawTool>("cursor");

  useEffect(() => {
    const onSection = (e: Event) => {
      const detail = (e as CustomEvent<{ section: string | null }>).detail;
      setVisible(detail?.section === "tools");
      if (detail?.section !== "tools" && canvas) {
        exitDrawing(canvas);
        setTool("cursor");
      }
    };
    window.addEventListener(SECTION_EVENT, onSection);
    return () => window.removeEventListener(SECTION_EVENT, onSection);
  }, [canvas]);

  useEffect(() => {
    if (!canvas || !visible) return;

    if (tool === "cursor") {
      exitDrawing(canvas);
      return;
    }
    if (tool === "pencil") {
      applyBrush(canvas, { width: 2, color: "#202124" });
      return;
    }
    if (tool === "pen") {
      applyBrush(canvas, { width: 4, color: "#111827" });
      return;
    }
    if (tool === "highlighter") {
      applyBrush(canvas, { width: 18, color: "rgba(250, 204, 21, 0.45)" });
      return;
    }
    if (tool === "freeform") {
      applyBrush(canvas, { width: 8, color: "#8b3dff" });
      return;
    }
    // line / text are click actions — stay in select mode
    exitDrawing(canvas);
  }, [canvas, tool, visible]);

  useEffect(() => {
    return () => {
      if (canvas) exitDrawing(canvas);
    };
  }, [canvas]);

  if (!visible) return null;

  const selectTool = (id: DrawTool) => {
    if (id === "text") {
      addText("body");
      scheduleSave?.();
      setTool("cursor");
      if (canvas) exitDrawing(canvas);
      return;
    }
    if (id === "line") {
      addShape("line");
      scheduleSave?.();
      setTool("cursor");
      if (canvas) exitDrawing(canvas);
      return;
    }
    setTool(id);
  };

  return (
    <div class="design-draw-palette" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          class={`design-draw-palette-btn ${tool === id ? "design-draw-palette-btn-active" : ""}`}
          title={label}
          aria-label={label}
          aria-pressed={tool === id}
          onClick={() => selectTool(id)}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
