"use client";

import { useEffect, useState, type ReactNode } from "react";
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
};

export function SideDrawer({
  open,
  onClose,
  children,
  className,
  labelledBy,
  zIndex = 50,
  closeOnEscape = true,
  wide = false,
  side = "right",
}: SideDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState(false);

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
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && closeOnEscape) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, closeOnEscape]);

  if (!mounted || !present) return null;

  return createPortal(
    <div
      className="side-drawer"
      style={{ zIndex }}
      data-open={shown ? "1" : "0"}
      data-side={side}
    >
      <button
        type="button"
        className="side-drawer-overlay"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "side-drawer-panel",
          wide && "side-drawer-panel-wide",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="side-drawer-handle" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}
