"use client";

import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { cn } from "@/lib/cn";

export const QUOTE_CATALOG_WIDTH_KEY = "quote.catalogWidth";
export const QUOTE_CATALOG_WIDTH_DEFAULT = 300;

const CATALOG_MIN = 200;
const QUOTE_MIN = 420;

export function readQuoteCatalogWidth(): number {
  if (typeof window === "undefined") return QUOTE_CATALOG_WIDTH_DEFAULT;
  const raw = Number(localStorage.getItem(QUOTE_CATALOG_WIDTH_KEY));
  if (!Number.isFinite(raw)) return QUOTE_CATALOG_WIDTH_DEFAULT;
  return Math.round(raw);
}

export function clampQuoteCatalogWidth(value: number, parentWidth: number) {
  const max = Math.max(CATALOG_MIN, Math.min(parentWidth * 0.62, parentWidth - QUOTE_MIN));
  return Math.min(max, Math.max(CATALOG_MIN, Math.round(value)));
}

export function quoteCatalogWidthStyle(width: number): CSSProperties {
  return { "--quote-catalog-width": `${width}px` } as CSSProperties;
}

export function QuoteCatalogSplit({
  containerRef,
  width,
  onWidth,
  title = "Потяните, чтобы изменить ширину каталога",
}: {
  containerRef: RefObject<HTMLElement | null>;
  width: number;
  onWidth: (next: number) => void;
  title?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const parentWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
  const maxWidth = parentWidth > 0 ? clampQuoteCatalogWidth(parentWidth, parentWidth) : undefined;

  function resizeBy(delta: number) {
    const parent = containerRef.current?.getBoundingClientRect().width ?? width + QUOTE_MIN;
    onWidth(clampQuoteCatalogWidth(width + delta, parent));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const parent = containerRef.current;
    if (!parent) return;
    const startX = e.clientX;
    const startW = width;
    const parentWidth = parent.getBoundingClientRect().width;
    setDragging(true);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function move(ev: PointerEvent) {
      onWidth(clampQuoteCatalogWidth(startW + ev.clientX - startX, parentWidth));
    }
    function up() {
      setDragging(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина каталога"
      aria-valuemin={CATALOG_MIN}
      aria-valuenow={Math.round(width)}
      aria-valuemax={maxWidth}
      title={title}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onWidth(QUOTE_CATALOG_WIDTH_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          resizeBy(-step);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          resizeBy(step);
        } else if (e.key === "Home") {
          e.preventDefault();
          onWidth(QUOTE_CATALOG_WIDTH_DEFAULT);
        }
      }}
      className={cn(
        "group sticky top-2 z-10 hidden h-[calc(100dvh-5.5rem)] w-3 shrink-0 cursor-col-resize touch-none items-center justify-center lg:flex",
        "focus-visible:outline-none",
      )}
    >
      <span
        className={cn(
          "h-12 w-px rounded-full bg-[var(--line)] transition-colors",
          "group-hover:w-0.5 group-hover:bg-[var(--accent)] group-focus-visible:w-0.5 group-focus-visible:bg-[var(--accent)]",
          dragging && "w-0.5 bg-[var(--accent)]",
        )}
      />
    </button>
  );
}
