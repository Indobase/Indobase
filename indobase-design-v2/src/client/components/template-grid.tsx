import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import type { Template } from "../types";
import { TemplateCard } from "./template-card";

interface Props {
  templates: Template[];
  onSelect: (t: Template) => void;
  /** Initial visible count; grows on scroll / Load more. */
  pageSize?: number;
  columnsClass?: string;
}

/**
 * Windowed template grid — only mounts a growing slice so 2500 thumbs
 * don't all enqueue Fabric renders at once. Thumb queue still caps concurrency.
 */
export function TemplateGrid({
  templates,
  onSelect,
  pageSize = 40,
  columnsClass = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3",
}: Props) {
  const [visible, setVisible] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(pageSize);
  }, [templates, pageSize]);

  const loadMore = useCallback(() => {
    setVisible((v) => Math.min(v + pageSize, templates.length));
  }, [pageSize, templates.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, visible, templates.length]);

  const slice = templates.slice(0, visible);

  return (
    <div>
      <div class={columnsClass}>
        {slice.map((t) => (
          <TemplateCard key={t.id || t.name + t.width} template={t} onClick={() => onSelect(t)} />
        ))}
      </div>
      {visible < templates.length && (
        <div ref={sentinelRef} class="flex justify-center py-4">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-xs font-semibold border border-zinc-200 bg-white text-zinc-600 cursor-pointer hover:border-accent hover:text-accent"
            onClick={loadMore}
          >
            Show more ({templates.length - visible} left)
          </button>
        </div>
      )}
    </div>
  );
}
