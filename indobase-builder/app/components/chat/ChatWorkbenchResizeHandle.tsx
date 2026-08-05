import { useCallback, useEffect, useRef, useState } from 'react';
import { classNames } from '~/utils/classNames';

const CHAT_MIN_PX = 320;
const CHAT_MAX_RATIO = 0.55;
const STORAGE_KEY = 'indobase.builder.chatWidthPx';

/**
 * Emergent-style vertical scrollbar / drag handle between chat and preview.
 * Adjusts --chat-min-width and workbench CSS vars on the document root.
 */
export function ChatWorkbenchResizeHandle({ visible }: { visible: boolean }) {
  const dragging = useRef(false);
  const [active, setActive] = useState(false);

  const applyWidth = useCallback((chatPx: number) => {
    const root = document.documentElement;
    const viewport = window.innerWidth;
    const maxChat = Math.floor(viewport * CHAT_MAX_RATIO);
    const clamped = Math.max(CHAT_MIN_PX, Math.min(maxChat, Math.round(chatPx)));
    const gutter = 24;
    const workbench = Math.min(2536, Math.max(280, viewport - clamped - gutter));

    root.style.setProperty('--chat-min-width', `${clamped}px`);
    root.style.setProperty('--workbench-width', `${workbench}px`);
    root.style.setProperty('--workbench-inner-width', `${workbench}px`);
    // Keep default formula: right-docked workbench
    root.style.setProperty('--workbench-left', `calc(100% - ${workbench}px - 0.75rem)`);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) {
      applyWidth(stored);
    }

    const onResize = () => {
      const current = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--chat-min-width'),
      );
      if (Number.isFinite(current) && current > 0) {
        applyWidth(current);
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [visible, applyWidth]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onMove = (event: PointerEvent) => {
      if (!dragging.current) {
        return;
      }

      applyWidth(event.clientX);
    };

    const onUp = (event: PointerEvent) => {
      if (!dragging.current) {
        return;
      }

      dragging.current = false;
      setActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      applyWidth(event.clientX);
      const current = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--chat-min-width'),
      );
      if (Number.isFinite(current)) {
        localStorage.setItem(STORAGE_KEY, String(Math.round(current)));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [visible, applyWidth]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat and preview"
      title="Drag to resize"
      onPointerDown={(event) => {
        event.preventDefault();
        dragging.current = true;
        setActive(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      }}
      className={classNames(
        'relative z-20 hidden w-3 shrink-0 cursor-col-resize touch-none lg:flex lg:flex-col lg:items-center lg:justify-center',
        active ? 'opacity-100' : 'opacity-80 hover:opacity-100',
      )}
    >
      {/* Track — Emergent-like thin scrollbar between panes */}
      <div className="absolute inset-y-6 left-1/2 w-[5px] -translate-x-1/2 rounded-full bg-[#D7DCE3]" />
      <div
        className={classNames(
          'absolute left-1/2 top-1/2 h-24 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors',
          active ? 'bg-[#9AA3AF]' : 'bg-[#B8C0CC] hover:bg-[#9AA3AF]',
        )}
      />
    </div>
  );
}
