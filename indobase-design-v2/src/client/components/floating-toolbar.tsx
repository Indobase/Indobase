import { useEffect, useState } from "preact/hooks";
import { Lock, LockOpen, Copy, Trash2 } from "lucide-preact";
import { useEditor } from "../context";

interface Pos {
  left: number;
  top: number;
}

export function FloatingToolbar() {
  const { selectedObject, canvas, deleteSelected, setLayerLocked, scheduleSave } = useEditor();
  const [pos, setPos] = useState<Pos | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!selectedObject) {
      setPos(null);
      return;
    }
    setLocked(selectedObject.selectable === false || selectedObject.evented === false);

    const update = () => {
      if (!selectedObject || !canvas) {
        setPos(null);
        return;
      }
      try {
        const br = selectedObject.getBoundingRect();
        const el = (canvas.upperCanvasEl || canvas.getElement()) as HTMLElement;
        const crect = el.getBoundingClientRect();
        const cw = Math.max(1, canvas.getWidth());
        const ch = Math.max(1, canvas.getHeight());
        const sx = crect.width / cw;
        const sy = crect.height / ch;
        setPos({
          left: crect.left + (br.left + br.width / 2) * sx,
          top: crect.top + br.top * sy - 10,
        });
      } catch {
        setPos(null);
      }
    };

    update();
    canvas?.on("object:moving", update);
    canvas?.on("object:scaling", update);
    canvas?.on("object:rotating", update);
    canvas?.on("object:modified", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      canvas?.off("object:moving", update);
      canvas?.off("object:scaling", update);
      canvas?.off("object:rotating", update);
      canvas?.off("object:modified", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selectedObject, canvas]);

  if (!selectedObject || !pos) return null;

  const duplicate = async () => {
    if (!canvas || !selectedObject) return;
    const clone = await selectedObject.clone();
    clone.set({
      left: (selectedObject.left || 0) + 20,
      top: (selectedObject.top || 0) + 20,
    });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
    scheduleSave?.();
  };

  const toggleLock = () => {
    if (!selectedObject) return;
    const next = !locked;
    setLayerLocked(selectedObject, next);
    setLocked(next);
    scheduleSave?.();
  };

  return (
    <div
      class="design-floating-toolbar"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      role="toolbar"
      aria-label="Selection actions"
    >
      <button
        type="button"
        class="design-floating-toolbar-btn"
        title={locked ? "Unlock" : "Lock"}
        onClick={toggleLock}
      >
        {locked ? <LockOpen size={15} /> : <Lock size={15} />}
      </button>
      <button
        type="button"
        class="design-floating-toolbar-btn"
        title="Duplicate"
        onClick={() => void duplicate()}
      >
        <Copy size={15} />
      </button>
      <button
        type="button"
        class="design-floating-toolbar-btn design-floating-toolbar-btn-danger"
        title="Delete"
        onClick={deleteSelected}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
