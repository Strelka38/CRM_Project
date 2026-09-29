"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePermissions } from "@/components/PermissionProvider";
import {
  canCreateCalendarDayOff,
  canCreateCalendarProject,
  canCreateCalendarRental,
  canCreateCalendarTask,
} from "@/lib/roles";

export type CalendarCreateAction =
  | "project"
  | "rental"
  | "task"
  | "day_off";

type Props = {
  open: boolean;
  x: number;
  y: number;
  role: string | null | undefined;
  onClose: () => void;
  onSelect: (action: CalendarCreateAction) => void;
};

const ITEMS: Array<{
  action: CalendarCreateAction;
  label: string;
  allowed: typeof canCreateCalendarProject;
}> = [
  {
    action: "project",
    label: "Проект",
    allowed: canCreateCalendarProject,
  },
  {
    action: "rental",
    label: "Аренда оборудования",
    allowed: canCreateCalendarRental,
  },
  {
    action: "task",
    label: "Задача",
    allowed: canCreateCalendarTask,
  },
  {
    action: "day_off",
    label: "Выходной",
    allowed: canCreateCalendarDayOff,
  },
];

export function CalendarCreateMenu({
  open,
  x,
  y,
  role,
  onClose,
  onSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { overrides } = usePermissions();
  const items = ITEMS.filter((i) => i.allowed(role, overrides));

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || items.length === 0 || typeof document === "undefined") return null;

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 200);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[80] min-w-[11.5rem] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] py-1 shadow-xl"
      style={{ left, top }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className="block w-full px-3.5 py-2 text-left text-sm text-[var(--ink)] transition-colors hover:bg-[var(--selected)] hover:text-[var(--accent-deep)]"
          onClick={() => {
            onSelect(item.action);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
