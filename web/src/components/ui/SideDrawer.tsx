"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type SideDrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes on the sliding panel. */
  className?: string;
  labelledBy?: string;
  zIndex?: number;
  closeOnEscape?: boolean;
  wide?: boolean;
  /** Desktop: панель слева. На мобильном по-прежнему снизу. */
  side?: "left" | "right";
  /** Без оверлея: колонка внутри календаря. */
  embedded?: boolean;
  /** false — панель справа без диммера, клики в дерево/страницу проходят. */
  modal?: boolean;
};

const DISMISS_PX = 88;
const DISMISS_VELOCITY = 0.55;
const LOCK_PX = 12;

type DragState = {
  pointerId: number;
  startY: number;
  startT: number;
  locked: boolean;
  y: number;
  scrollable: HTMLElement | null;
};

function sheetIsBottom(): boolean {
  const layout = document.documentElement.dataset.layout;
  if (layout === "desktop") return false;
  if (layout === "mobile") return true;
  return window.matchMedia("(max-width: 767px)").matches;
}

function isField(el: HTMLElement) {
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

function nearestScrollable(el: HTMLElement, root: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function SideDrawer({
  open,
  onClose,
  children,
  className,
  labelledBy,
  zIndex = 60,
  closeOnEscape = true,
  wide = false,
  side = "right",
  embedded = false,
  modal = true,
}: SideDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    setShown(false);
    const t = window.setTimeout(() => setPresent(false), 280);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !present) return;
    setShown(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open, present]);

  useEffect(() => {
    if (!open || embedded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && closeOnEscape) onClose();
    }
    document.addEventListener("keydown", onKey);
    if (!modal) {
      return () => document.removeEventListener("keydown", onKey);
    }
    const html = document.documentElement;
    const prevBody = document.body.style.overflow;
    const prevHtml = html.style.overflow;
    document.body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    html.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevBody;
      html.style.overflow = prevHtml;
      html.classList.remove("sheet-open");
    };
  }, [open, onClose, closeOnEscape, embedded, modal]);

  useEffect(() => {
    if (!open || !present || embedded || !modal) return;
    const root = rootRef.current;
    if (!root) return;
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const state = drag.current;
      if (state?.locked) {
        e.preventDefault();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".side-drawer-overlay")) {
        e.preventDefault();
        return;
      }
      const panel = panelRef.current;
      if (!panel || !panel.contains(target)) {
        e.preventDefault();
        return;
      }
      if (isField(target)) return;
      const scrollable = state?.scrollable ?? nearestScrollable(target, panel);
      const dy = state ? e.touches[0].clientY - state.startY : 0;
      if (!scrollable || (scrollable.scrollTop <= 0 && dy > 0)) {
        e.preventDefault();
      }
    }
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => root.removeEventListener("touchmove", onTouchMove);
  }, [open, present, embedded, modal]);

  useEffect(() => {
    if (open) return;
    const root = rootRef.current;
    if (!root) return;
    root.classList.remove("is-sheet-drag");
    root.style.removeProperty("--sheet-y");
    root.style.removeProperty("--sheet-dim");
  }, [open]);

  function applyDrag(y: number) {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;
    const h = panel.getBoundingClientRect().height || 1;
    const clamped = Math.max(0, y);
    root.style.setProperty("--sheet-y", `${clamped}px`);
    root.style.setProperty(
      "--sheet-dim",
      String(Math.max(0.15, 1 - clamped / h)),
    );
  }

  function clearDragVars() {
    const root = rootRef.current;
    if (!root) return;
    root.classList.remove("is-sheet-drag");
    root.style.removeProperty("--sheet-y");
    root.style.removeProperty("--sheet-dim");
  }

  function lockDrag(pointerId: number) {
    const panel = panelRef.current;
    rootRef.current?.classList.add("is-sheet-drag");
    try {
      panel?.setPointerCapture(pointerId);
    } catch {
      /* iOS synthetic / lost pointer */
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (embedded || !sheetIsBottom() || e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target = e.target as HTMLElement;
    if (isField(target)) return;
    const onGrab = Boolean(target.closest("[data-sheet-grab]"));
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startT: e.timeStamp,
      locked: onGrab,
      y: 0,
      scrollable: onGrab ? null : nearestScrollable(target, panel),
    };
    if (onGrab) lockDrag(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dy = e.clientY - state.startY;
    if (!state.locked) {
      if (dy < LOCK_PX) return;
      if (state.scrollable && state.scrollable.scrollTop > 0) {
        drag.current = null;
        return;
      }
      state.locked = true;
      lockDrag(e.pointerId);
    }
    if (dy < 0) {
      state.y = 0;
      applyDrag(0);
      return;
    }
    e.preventDefault();
    state.y = dy;
    applyDrag(dy);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const panel = panelRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    drag.current = null;
    if (panel?.hasPointerCapture(e.pointerId)) {
      panel.releasePointerCapture(e.pointerId);
    }
    if (!state.locked) return;
    const dt = Math.max(1, e.timeStamp - state.startT);
    const velocity = state.y / dt;
    const shouldClose =
      state.y > DISMISS_PX || velocity > DISMISS_VELOCITY;
    rootRef.current?.classList.remove("is-sheet-drag");
    if (shouldClose) {
      onClose();
      return;
    }
    applyDrag(0);
    window.setTimeout(clearDragVars, 280);
  }

  if (embedded) {
    if (!open) return null;
    return (
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby={labelledBy}
        className={cn("flex h-full min-h-0 flex-col", className)}
      >
        {children}
      </div>
    );
  }

  if (!mounted || !present) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="side-drawer"
      style={{ zIndex }}
      data-open={shown ? "1" : "0"}
      data-side={side}
      data-modal={modal ? "1" : "0"}
    >
      {modal ? (
        <button
          type="button"
          className="side-drawer-overlay"
          aria-label="Закрыть"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={labelledBy}
        className={cn(
          "side-drawer-panel",
          wide && "side-drawer-panel-wide",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="side-drawer-grab" data-sheet-grab>
          <div className="side-drawer-handle" aria-hidden />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
