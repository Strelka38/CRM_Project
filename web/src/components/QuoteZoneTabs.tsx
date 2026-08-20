"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ZoneTab = {
  id: string;
  name: string;
  sortOrder: number;
  active?: boolean;
};

type Props = {
  zones: ZoneTab[];
  activeId: string; // zone id or "summary"
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (id: string) => void;
  canEdit?: boolean;
};

export function QuoteZoneTabs({
  zones,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onToggleActive,
  canEdit = true,
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  function closeMenu() {
    setMenuId(null);
    setMenuPos(null);
  }

  function toggleMenu(id: string) {
    if (menuId === id) {
      closeMenu();
      return;
    }
    const btn = buttonRefs.current.get(id);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = 176;
    setMenuPos({
      top: r.bottom + 4,
      left: Math.min(
        Math.max(8, r.right - width),
        window.innerWidth - width - 8,
      ),
    });
    setMenuId(id);
  }

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      for (const btn of buttonRefs.current.values()) {
        if (btn.contains(t)) return;
      }
      closeMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    function onScroll() {
      closeMenu();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuId]);

  const menuZone = zones.find((z) => z.id === menuId) ?? null;

  return (
    <div className="flex flex-wrap items-end gap-1 overflow-visible border-b border-[var(--line)]">
      {zones.map((z) => {
        const selected = activeId === z.id;
        const off = z.active === false;
        return (
          <div
            key={z.id}
            className={`group relative flex items-center gap-1 rounded-t-md border border-b-0 px-2 py-1.5 text-sm ${
              selected
                ? "border-[var(--line)] bg-[var(--panel)] font-medium text-[var(--ink)]"
                : "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel-muted)]"
            } ${off ? "opacity-50" : ""}`}
          >
            <button
              type="button"
              className="max-w-[10rem] truncate"
              onClick={() => onSelect(z.id)}
              title={
                off
                  ? `${z.name} — выключена, не в сумме и резерве`
                  : z.name
              }
            >
              {off ? `${z.name} (выкл.)` : z.name}
            </button>
            {canEdit && (
              <button
                type="button"
                ref={(el) => {
                  if (el) buttonRefs.current.set(z.id, el);
                  else buttonRefs.current.delete(z.id);
                }}
                className="px-1 text-[var(--muted)] hover:text-[var(--ink)]"
                aria-expanded={menuId === z.id}
                aria-haspopup="menu"
                aria-label={`Меню зоны ${z.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMenu(z.id);
                }}
              >
                ⋯
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onSelect("summary")}
        className={`rounded-t-md border border-b-0 px-3 py-1.5 text-sm ${
          activeId === "summary"
            ? "border-[var(--line)] bg-[var(--panel)] font-medium"
            : "border-transparent text-[var(--muted)] hover:bg-[var(--panel-muted)]"
        }`}
      >
        Сводная
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="mb-0.5 ml-1 flex size-7 items-center justify-center rounded-md border border-[var(--line)] text-sm text-[var(--accent)] hover:bg-white/10"
          title="Добавить зону"
        >
          +
        </button>
      )}

      {menuZone && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[80] w-44 rounded-md border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--selected)]/50"
                onClick={() => {
                  const zone = menuZone;
                  closeMenu();
                  const name = prompt("Название зоны", zone.name);
                  if (name && name.trim()) onRename(zone.id, name.trim());
                }}
              >
                Переименовать
              </button>
              {onToggleActive && (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--selected)]/50"
                  onClick={() => {
                    const id = menuZone.id;
                    closeMenu();
                    onToggleActive(id);
                  }}
                >
                  {menuZone.active === false
                    ? "Включить в расчёт"
                    : "Выключить (скрыть из суммы)"}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-xs text-[var(--danger)] hover:bg-red-500/15 disabled:opacity-40"
                disabled={zones.length <= 1}
                onClick={() => {
                  const id = menuZone.id;
                  closeMenu();
                  onDelete(id);
                }}
              >
                Удалить
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
