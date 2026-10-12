"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  formatZoneDateHint,
  workingDayCount,
} from "@/lib/quote-assignment-days";
import type { ZonePricing } from "@/lib/zone-pricing";

export type ZoneTab = {
  id: string;
  name: string;
  sortOrder: number;
  active?: boolean;
  workingDayIndexes?: number[];
  pricing?: ZonePricing;
};

type Props = {
  zones: ZoneTab[];
  activeId: string; // zone id or "summary"
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (id: string) => void;
  onCopy?: (id: string) => void;
  onCopyTo?: (id: string) => void;
  onOpenParams?: (id: string) => void;
  onReorder?: (id: string, dir: -1 | 1) => void;
  onRefreshPrices?: (id: string) => void;
  onCopySelected?: (id: string, targetZoneId: string) => void;
  onDeleteSelected?: (id: string) => void;
  onMoveSelected?: (id: string, targetZoneId: string) => void;
  onRefreshSelected?: (id: string) => void;
  onShowKitContents?: (zoneId: string, open: boolean) => void;
  kitContentsOpen?: boolean;
  selectedCount?: number;
  canEdit?: boolean;
  showSummary?: boolean;
  /** Имя вкладки. При одной зоне его нет — смотреть не на что. */
  showNames?: boolean;
  eventDate?: string;
  durationDays?: number;
};

export function QuoteZoneTabs({
  zones,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onToggleActive,
  onCopy,
  onCopyTo,
  onOpenParams,
  onReorder,
  onRefreshPrices,
  onCopySelected,
  onDeleteSelected,
  onMoveSelected,
  onRefreshSelected,
  onShowKitContents,
  kitContentsOpen = false,
  selectedCount = 0,
  canEdit = true,
  showSummary = true,
  showNames = true,
  eventDate,
  durationDays,
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [sub, setSub] = useState<string | null>(null);
  const [subLeft, setSubLeft] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  function closeMenu() {
    setMenuId(null);
    setMenuPos(null);
    setSub(null);
  }

  function toggleMenu(id: string) {
    if (menuId === id) {
      closeMenu();
      return;
    }
    const btn = buttonRefs.current.get(id);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = 288;
    const left = Math.min(
      Math.max(8, r.right - width),
      window.innerWidth - width - 8,
    );
    setSubLeft(left + width + 200 > window.innerWidth);
    setSub(null);
    setMenuPos({
      top: r.bottom + 4,
      left,
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
        const eventDays = workingDayCount(durationDays);
        const hint =
          eventDays >= 2
            ? formatZoneDateHint(z.workingDayIndexes ?? [], eventDays, eventDate)
            : "";
        return (
          <div
            key={z.id}
            className={`group relative -mb-px flex items-center gap-0.5 rounded-t-md border px-2 py-1.5 text-xs ${
              selected
                ? "border-[var(--line)] border-b-[var(--panel)] bg-[var(--panel)] font-medium text-[var(--ink)]"
                : "border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
            } ${off ? "opacity-50" : ""}`}
          >
            <button
              type="button"
              className="max-w-[12rem] truncate text-left"
              onClick={() => onSelect(z.id)}
              title={
                off
                  ? `${z.name} — выключена, не в сумме и резерве`
                  : hint
                    ? `${z.name} · ${hint}`
                    : z.name
              }
            >
              <span className="block truncate">
                {showNames ? (off ? `${z.name} (выкл.)` : z.name) : (
                  <span className="sr-only">{z.name}</span>
                )}
              </span>
              {showNames && hint ? (
                <span
                  className={`block truncate text-caption font-normal ${
                    selected ? "text-[var(--muted)]" : ""
                  }`}
                >
                  {hint}
                </span>
              ) : null}
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

      {showSummary ? (
        <button
          type="button"
          onClick={() => onSelect("summary")}
          className={`-mb-px rounded-t-md border px-2.5 py-1.5 text-xs ${
            activeId === "summary"
              ? "border-[var(--line)] border-b-[var(--panel)] bg-[var(--panel)] font-medium"
              : "border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]"
          }`}
        >
          Сводная
        </button>
      ) : null}

      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="mb-0.5 ml-1 flex size-6 items-center justify-center rounded border border-[var(--line)] text-xs text-[var(--accent)] hover:bg-white/10"
          title="Добавить зону"
        >
          +
        </button>
      )}

      {menuZone && menuPos && typeof document !== "undefined"
        ? createPortal(
            <SheetMenu
              menuRef={menuRef}
              menuPos={menuPos}
              subLeft={subLeft}
              sub={sub}
              setSub={setSub}
              zone={menuZone}
              zones={zones}
              selectedCount={selectedCount}
              kitContentsOpen={kitContentsOpen}
              onClose={closeMenu}
              onRename={onRename}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              onCopy={onCopy}
              onCopyTo={onCopyTo}
              onOpenParams={onOpenParams}
              onReorder={onReorder}
              onRefreshPrices={onRefreshPrices}
              onCopySelected={onCopySelected}
              onDeleteSelected={onDeleteSelected}
              onMoveSelected={onMoveSelected}
              onRefreshSelected={onRefreshSelected}
              onShowKitContents={onShowKitContents}
              onSelectZone={onSelect}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

const ITEM =
  "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-[var(--selected)]/50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

function SheetMenu({
  menuRef,
  menuPos,
  subLeft,
  sub,
  setSub,
  zone,
  zones,
  selectedCount,
  kitContentsOpen,
  onClose,
  onRename,
  onDelete,
  onToggleActive,
  onCopy,
  onCopyTo,
  onOpenParams,
  onReorder,
  onRefreshPrices,
  onCopySelected,
  onDeleteSelected,
  onMoveSelected,
  onRefreshSelected,
  onShowKitContents,
  onSelectZone,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  menuPos: { top: number; left: number };
  subLeft: boolean;
  sub: string | null;
  setSub: (id: string | null) => void;
  zone: ZoneTab;
  zones: ZoneTab[];
  selectedCount: number;
  kitContentsOpen: boolean;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (id: string) => void;
  onCopy?: (id: string) => void;
  onCopyTo?: (id: string) => void;
  onOpenParams?: (id: string) => void;
  onReorder?: (id: string, dir: -1 | 1) => void;
  onRefreshPrices?: (id: string) => void;
  onCopySelected?: (id: string, targetZoneId: string) => void;
  onDeleteSelected?: (id: string) => void;
  onMoveSelected?: (id: string, targetZoneId: string) => void;
  onRefreshSelected?: (id: string) => void;
  onShowKitContents?: (zoneId: string, open: boolean) => void;
  onSelectZone: (id: string) => void;
}) {
  const index = zones.findIndex((z) => z.id === zone.id);
  const others = zones.filter((z) => z.id !== zone.id);
  const hasSelection = selectedCount > 0;

  function run(fn?: (id: string) => void) {
    const id = zone.id;
    onClose();
    fn?.(id);
  }

  function flyout(id: string, label: string, items: ReactNode) {
    const open = sub === id;
    return (
      <div className="relative">
        <button
          type="button"
          role="menuitem"
          aria-expanded={open}
          className={ITEM}
          onClick={() => setSub(open ? null : id)}
        >
          {label}
          <span aria-hidden className="text-[var(--muted)]">
            ›
          </span>
        </button>
        {open ? (
          <div
            role="menu"
            className={`absolute top-0 z-10 w-52 rounded-md border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg ${
              subLeft ? "right-full mr-1" : "left-full ml-1"
            }`}
          >
            {items}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[80] w-72 rounded-md border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg"
      style={{ top: menuPos.top, left: menuPos.left }}
    >
      <p className="px-3 pb-1 pt-1.5 text-sm font-medium text-[var(--ink)]">Параметры</p>
      <button
        type="button"
        role="menuitem"
        className={ITEM}
        onClick={() => {
          const current = zone;
          onClose();
          const name = prompt("Название листа", current.name);
          if (name && name.trim()) onRename(current.id, name.trim());
        }}
      >
        Переименовать
      </button>
      <button type="button" role="menuitem" className={ITEM} onClick={() => run(onCopy)}>
        Копировать лист
      </button>
      <button type="button" role="menuitem" className={ITEM} onClick={() => run(onCopyTo)}>
        Копировать лист в…
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${ITEM} text-[var(--danger)]`}
        disabled={zones.length <= 1}
        onClick={() => run(onDelete)}
      >
        Удалить лист
      </button>
      <div className="my-1 border-t border-[var(--line)]" />
      {onToggleActive ? (
        <button
          type="button"
          role="menuitem"
          className={ITEM}
          onClick={() => run(onToggleActive)}
        >
          {zone.active === false ? "Активировать" : "Деактивировать"}
        </button>
      ) : null}
      <button type="button" role="menuitem" className={ITEM} onClick={() => run(onOpenParams)}>
        Коэффициент, скидка, налоги
      </button>
      {flyout(
        "order",
        "Упорядочить",
        <>
          <button
            type="button"
            className={ITEM}
            disabled={index <= 0}
            onClick={() => {
              const id = zone.id;
              onClose();
              onReorder?.(id, -1);
            }}
          >
            Раньше
          </button>
          <button
            type="button"
            className={ITEM}
            disabled={index < 0 || index >= zones.length - 1}
            onClick={() => {
              const id = zone.id;
              onClose();
              onReorder?.(id, 1);
            }}
          >
            Позже
          </button>
        </>,
      )}
      <button
        type="button"
        role="menuitem"
        className={ITEM}
        onClick={() => run(onRefreshPrices)}
      >
        Актуализировать цены
      </button>
      <div className="my-1 border-t border-[var(--line)]" />
      {flyout(
        "copy-sel",
        "Копировать выделенные",
        <>
          <button
            type="button"
            className={ITEM}
            disabled={!hasSelection}
            onClick={() => {
              const id = zone.id;
              onClose();
              onCopySelected?.(id, id);
            }}
          >
            В этот лист
          </button>
          {others.map((target) => (
            <button
              key={target.id}
              type="button"
              className={ITEM}
              disabled={!hasSelection}
              onClick={() => {
                const id = zone.id;
                onClose();
                onCopySelected?.(id, target.id);
              }}
            >
              В «{target.name}»
            </button>
          ))}
        </>,
      )}
      <button
        type="button"
        role="menuitem"
        className={`${ITEM} text-[var(--danger)]`}
        disabled={!hasSelection}
        onClick={() => run(onDeleteSelected)}
      >
        Удалить выделенные
      </button>
      {flyout(
        "move-sel",
        "Перенести выделенные",
        others.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-[var(--muted)]">Других листов нет</p>
        ) : (
          others.map((target) => (
            <button
              key={target.id}
              type="button"
              className={ITEM}
              disabled={!hasSelection}
              onClick={() => {
                const id = zone.id;
                onClose();
                onMoveSelected?.(id, target.id);
              }}
            >
              В «{target.name}»
            </button>
          ))
        ),
      )}
      {flyout(
        "actions-sel",
        "Действия с выделенными",
        <button
          type="button"
          className={ITEM}
          disabled={!hasSelection}
          onClick={() => run(onRefreshSelected)}
        >
          Актуализировать цены
        </button>,
      )}
      <div className="my-1 border-t border-[var(--line)]" />
      <button
        type="button"
        role="menuitem"
        className={ITEM}
        onClick={() => {
          onSelectZone(zone.id);
          onClose();
          onShowKitContents?.(zone.id, true);
        }}
      >
        Показать состав комплекта/набора
        {kitContentsOpen ? <span className="text-[var(--accent)]">✓</span> : null}
      </button>
      <button
        type="button"
        role="menuitem"
        className={ITEM}
        onClick={() => {
          onSelectZone(zone.id);
          onClose();
          onShowKitContents?.(zone.id, false);
        }}
      >
        Скрыть состав комплекта/набора
        {!kitContentsOpen ? <span className="text-[var(--muted)]">✓</span> : null}
      </button>
    </div>
  );
}
