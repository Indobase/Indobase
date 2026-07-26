/**
 * Layers panel — adapted from the z-order / object-stack pattern in
 * Apache-2.0 Davronov/canva-clone (bringForward / sendBackwards via Fabric).
 * See NOTICE.md and LICENSE.davronov.
 */
import { useEffect, useState } from "preact/hooks";
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-preact";
import type * as fabric from "fabric";
import { useEditor } from "../context";

function layerLabel(obj: fabric.FabricObject): string {
  const anyObj = obj as fabric.FabricObject & { text?: string; type?: string }
  if (typeof anyObj.text === "string" && anyObj.text.trim()) {
    const t = anyObj.text.trim()
    return t.length > 28 ? `${t.slice(0, 28)}…` : t
  }
  const type = (anyObj.type || "object").toString()
  if (type === "image") return "Image"
  if (type === "textbox" || type === "i-text" || type === "text") return "Text"
  if (type === "rect") return "Rectangle"
  if (type === "circle") return "Circle"
  if (type === "triangle") return "Triangle"
  if (type === "line") return "Line"
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export function LayersPanel() {
  const {
    canvas,
    selectedObject,
    deleteSelected,
    bringForward,
    sendBackward,
    setLayerVisible,
    setLayerLocked,
    layersVersion,
  } = useEditor();

  const [rows, setRows] = useState<fabric.FabricObject[]>([]);

  useEffect(() => {
    if (!canvas) {
      setRows([]);
      return;
    }
    // Top of stack first (matches design-tool expectation).
    setRows([...canvas.getObjects()].reverse());
  }, [canvas, layersVersion, selectedObject]);

  if (!canvas) {
    return <p class="text-zinc-400 text-[11px]">Open a design to manage layers.</p>;
  }

  if (rows.length === 0) {
    return (
      <div class="text-center py-6">
        <Layers size={22} class="text-zinc-300 mx-auto mb-2" />
        <p class="text-zinc-400 text-[11px] m-0">No layers yet</p>
        <p class="text-zinc-400 text-[10px] mt-1 m-0">Add text, shapes, or images</p>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-1">
      <p class="text-zinc-400 text-[11px] mb-1 m-0">
        Top of list is in front.
      </p>
      {rows.map((obj, index) => {
        const active = selectedObject === obj;
        const visible = obj.visible !== false;
        const locked = obj.selectable === false || obj.evented === false;
        return (
          <div
            key={(obj as { id?: string }).id || `${index}-${layerLabel(obj)}`}
            class={`flex items-center gap-1 rounded-md border px-1.5 py-1 cursor-pointer transition-all ${
              active
                ? "border-accent bg-accent/5"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
            onClick={() => {
              canvas.setActiveObject(obj);
              canvas.requestRenderAll();
            }}
          >
            <span class="flex-1 min-w-0 text-[11px] text-zinc-700 truncate font-medium">
              {layerLabel(obj)}
            </span>
            <button
              class="p-1 rounded bg-transparent border-none text-zinc-400 hover:text-zinc-800 cursor-pointer"
              title={visible ? "Hide" : "Show"}
              onClick={(e) => {
                e.stopPropagation();
                setLayerVisible(obj, !visible);
              }}
            >
              {visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              class="p-1 rounded bg-transparent border-none text-zinc-400 hover:text-zinc-800 cursor-pointer"
              title={locked ? "Unlock" : "Lock"}
              onClick={(e) => {
                e.stopPropagation();
                setLayerLocked(obj, !locked);
              }}
            >
              {locked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <button
              class="p-1 rounded bg-transparent border-none text-zinc-400 hover:text-zinc-800 cursor-pointer disabled:opacity-30"
              title="Bring forward"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                bringForward(obj);
              }}
            >
              <ChevronUp size={12} />
            </button>
            <button
              class="p-1 rounded bg-transparent border-none text-zinc-400 hover:text-zinc-800 cursor-pointer disabled:opacity-30"
              title="Send backward"
              disabled={index === rows.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                sendBackward(obj);
              }}
            >
              <ChevronDown size={12} />
            </button>
            <button
              class="p-1 rounded bg-transparent border-none text-zinc-400 hover:text-red-600 cursor-pointer"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                canvas.setActiveObject(obj);
                deleteSelected();
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
