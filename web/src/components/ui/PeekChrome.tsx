"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function DrawerCloseButton({
  onClick,
  variant = "close",
}: {
  onClick: () => void;
  /** back — стрелка «назад» для карточек, выезжающих справа. */
  variant?: "close" | "back";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="drawer-close flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]"
      aria-label={variant === "back" ? "Назад" : "Закрыть"}
    >
      {variant === "back" ? (
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 6 9 12l6 6" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      )}
    </button>
  );
}

export type PeekMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
};

export function PeekKebabMenu({ items }: { items: PeekMenuItem[] }) {
  const visible = items.filter((item) => !item.hidden);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const node = e.target as Node;
      if (btnRef.current?.contains(node)) return;
      const menu = document.getElementById("peek-kebab-menu");
      if (menu?.contains(node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Действия"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setRect(btnRef.current?.getBoundingClientRect() ?? null);
          setOpen(true);
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]"
      >
        <span className="flex flex-col items-center gap-[3px]" aria-hidden>
          <span className="size-1 rounded-full bg-current" />
          <span className="size-1 rounded-full bg-current" />
          <span className="size-1 rounded-full bg-current" />
        </span>
      </button>
      {open && rect
        ? createPortal(
            <div
              id="peek-kebab-menu"
              role="menu"
              className="fixed z-[80] min-w-[10.5rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
              style={{
                top: rect.bottom + 6,
                right: Math.max(8, window.innerWidth - rect.right),
              }}
            >
              {visible.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "block w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--ink)]/8 disabled:opacity-40",
                    item.danger
                      ? "text-[var(--danger)]"
                      : "text-[var(--ink)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function PeekHeader({
  onClose,
  menuItems,
  kind,
  kindId,
  children,
  closeVariant = "close",
}: {
  onClose: () => void;
  menuItems?: PeekMenuItem[];
  /** Тип записи в одной строке с крестиком: Проект, Аренда, Задача… */
  kind: string;
  kindId?: string;
  children?: ReactNode;
  closeVariant?: "close" | "back";
}) {
  return (
    <div className="border-b border-[var(--line)]">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <DrawerCloseButton onClick={onClose} variant={closeVariant} />
        <p
          id={kindId}
          className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-[var(--muted)]"
        >
          {kind}
        </p>
        {menuItems ? <PeekKebabMenu items={menuItems} /> : null}
      </div>
      {children ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}
