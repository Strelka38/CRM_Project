"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  overlayClassName,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4",
        overlayClassName,
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className={cn(
          "animate-fade-up max-h-[min(90dvh,100%)] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--hairline-strong)] bg-[var(--panel)] p-6 shadow-[0_24px_48px_rgba(0,0,0,0.4)]",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="mb-4 flex items-start justify-between gap-3">
            <h2
              id="modal-title"
              className="text-lg font-medium tracking-tight text-[var(--ink)]"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M4 4l8 8M12 4L4 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
