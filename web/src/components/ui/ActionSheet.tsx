"use client";

import { type ReactNode } from "react";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { cn } from "@/lib/cn";

export type ActionSheetItem = {
  /** Подпись действия. На мобильном это единственный способ понять кнопку. */
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
};

export type ActionSheetGroup = {
  title?: string;
  items: ActionSheetItem[];
};

/**
 * Список действий в панели снизу — замена тулбарам из иконок и поповерам,
 * которые обрезаются у края экрана.
 *
 * Опирается на SideDrawer: на мобильном он и так выезжает снизу, а Escape,
 * блокировку скролла и focus trap приносит с собой.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  groups,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: ActionSheetGroup[];
  footer?: ReactNode;
}) {
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter(Boolean) }))
    .filter((g) => g.items.length > 0);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      labelledBy="action-sheet-title"
      className="action-sheet-panel"
    >
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <h2
            id="action-sheet-title"
            className="min-w-0 flex-1 truncate text-title font-medium"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="tap-target -mr-1 flex items-center justify-center rounded-md px-2 text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)]"
          >
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
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {visible.map((group, gi) => (
            <div key={group.title ?? gi} className={gi > 0 ? "mt-2" : undefined}>
              {group.title ? (
                <p className="px-2 pb-1 pt-2 text-caption uppercase tracking-[0.04em] text-[var(--muted)]">
                  {group.title}
                </p>
              ) : null}
              {gi > 0 && !group.title ? (
                <div className="mx-2 mb-2 border-t border-[var(--line)]" />
              ) : null}
              {group.items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    onClose();
                    item.onSelect();
                  }}
                  className={cn(
                    "tap-target flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:opacity-40",
                    item.danger
                      ? "text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                      : "text-[var(--ink)] hover:bg-[var(--header-hover)]",
                  )}
                >
                  {item.icon ? (
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)]",
                        item.danger
                          ? "text-[var(--danger)]"
                          : "text-[var(--muted)]",
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.label}</span>
                    {item.hint ? (
                      <span className="mt-0.5 block truncate text-caption text-[var(--muted)]">
                        {item.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {footer ? (
          <div className="border-t border-[var(--line)] px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </SideDrawer>
  );
}
