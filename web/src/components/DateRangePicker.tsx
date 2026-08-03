"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  daysInclusive,
  endDateFromDuration,
  formatRuDate,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

type Props = {
  date: string;
  durationDays: number;
  onChange: (date: string, durationDays: number) => void;
  disabled?: boolean;
  className?: string;
  /** Always show calendar (e.g. inside a modal). Default: floating popup. */
  inline?: boolean;
};

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DateRangePicker({
  date,
  durationDays,
  onChange,
  disabled,
  className,
  inline = false,
}: Props) {
  const start = parseEventDate(date);
  const end = start
    ? endDateFromDuration(start, durationDays || 1)
    : null;

  const initialMonth = start || new Date();
  const [view, setView] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );
  const [pickingEnd, setPickingEnd] = useState(false);
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [open, setOpen] = useState(inline);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inline) setOpen(true);
  }, [inline]);

  useEffect(() => {
    if (inline || !open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        if (!pickingEnd) setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [inline, open, pickingEnd]);

  function showPopup() {
    if (disabled) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }

  function hidePopupSoon() {
    if (inline || pickingEnd) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const items: Array<{ key: string; day: Date | null }> = [];
    for (let i = 0; i < startPad; i++) {
      items.push({ key: `pad-${i}`, day: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d, 12);
      items.push({ key: formatRuDate(day), day });
    }
    return items;
  }, [view]);

  const rangeStart = pickingEnd && anchor ? startOfDay(anchor) : start;
  const rangeEnd = pickingEnd && anchor ? null : end;

  function handleDayClick(day: Date) {
    if (disabled) return;
    const clicked = startOfDay(day);

    if (!pickingEnd || !anchor) {
      setAnchor(clicked);
      setPickingEnd(true);
      onChange(formatRuDate(clicked), 1);
      return;
    }

    const a = startOfDay(anchor);
    const b = clicked;
    const from = a.getTime() <= b.getTime() ? a : b;
    const to = a.getTime() <= b.getTime() ? b : a;
    onChange(formatRuDate(from), daysInclusive(from, to));
    setPickingEnd(false);
    setAnchor(null);
  }

  function inRange(day: Date) {
    if (!rangeStart) return false;
    const t = startOfDay(day).getTime();
    if (pickingEnd && anchor) {
      return sameDay(day, anchor);
    }
    if (!rangeEnd) return sameDay(day, rangeStart);
    const a = startOfDay(rangeStart).getTime();
    const b = startOfDay(rangeEnd).getTime();
    return t >= Math.min(a, b) && t <= Math.max(a, b);
  }

  function isEdge(day: Date) {
    if (!rangeStart) return false;
    if (pickingEnd && anchor) return sameDay(day, anchor);
    if (sameDay(day, rangeStart)) return true;
    if (rangeEnd && sameDay(day, rangeEnd)) return true;
    return false;
  }

  const label = !start
    ? "Выберите даты…"
    : durationDays <= 1
      ? formatRuDate(start)
      : `${formatRuDate(start)} — ${formatRuDate(endDateFromDuration(start, durationDays))} (${durationDays} дн.)`;

  const calendar = (
    <div
      className={cn(
        "rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-lg",
        !inline && "w-[232px]",
      )}
      onMouseEnter={showPopup}
      onMouseLeave={hidePopupSoon}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          className="btn-icon h-6 w-6 text-sm"
          disabled={disabled}
          onClick={() =>
            setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
          }
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <span className="text-xs font-medium">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </span>
        <button
          type="button"
          className="btn-icon h-6 w-6 text-sm"
          disabled={disabled}
          onClick={() =>
            setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
          }
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[9px] uppercase tracking-wide text-[var(--muted)]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-0.5">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px">
        {cells.map(({ key, day }) => {
          if (!day) {
            return <div key={key} className="h-7" />;
          }
          const selected = inRange(day);
          const edge = isEdge(day);
          const today = sameDay(day, new Date());
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => handleDayClick(day)}
              className={cn(
                "flex h-7 items-center justify-center rounded text-xs tabular-nums transition-colors",
                "hover:bg-[var(--accent)]/15 disabled:opacity-40",
                today && !selected && "ring-1 ring-[var(--line)]",
                selected && !edge && "bg-[var(--accent)]/20 text-[var(--ink)]",
                edge && "bg-[var(--accent)] font-medium text-white",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted)]">
        {pickingEnd
          ? "Выберите конечную дату"
          : "Клик — начало, ещё раз — конец"}
      </p>

      {start && !disabled && (
        <button
          type="button"
          className="mt-0.5 text-[10px] text-[var(--accent-deep)] hover:underline"
          onClick={() => {
            onChange("", 1);
            setPickingEnd(false);
            setAnchor(null);
          }}
        >
          Очистить
        </button>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className={cn("text-sm", className)}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[var(--muted)]">Даты мероприятия</span>
          <span className="tabular-nums text-[var(--ink)]">{label}</span>
        </div>
        {calendar}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative text-sm", className)}
      onMouseEnter={showPopup}
      onMouseLeave={hidePopupSoon}
    >
      <span className="text-[var(--muted)]">Даты мероприятия</span>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "field mt-1 flex w-full items-center justify-between gap-2 text-left",
          !start && "text-[var(--muted)]",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onFocus={showPopup}
      >
        <span className="truncate tabular-nums">{label}</span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1">{calendar}</div>
      )}
    </div>
  );
}

/** Compact single-day picker (монтаж / демонтаж). */
export function SingleDatePicker({
  label,
  date,
  onChange,
  disabled,
  className,
}: {
  label: string;
  date: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selected = parseEventDate(date);
  const initialMonth = selected || new Date();
  const [view, setView] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function showPopup() {
    if (disabled) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }

  function hidePopupSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const items: Array<{ key: string; day: Date | null }> = [];
    for (let i = 0; i < startPad; i++) {
      items.push({ key: `pad-${i}`, day: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d, 12);
      items.push({ key: formatRuDate(day), day });
    }
    return items;
  }, [view]);

  const display = selected ? formatRuDate(selected) : "Не указан";

  return (
    <div
      ref={rootRef}
      className={cn("relative text-sm", className)}
      onMouseEnter={showPopup}
      onMouseLeave={hidePopupSoon}
    >
      <span className="text-[var(--muted)]">{label}</span>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "field mt-1 flex w-full items-center justify-between gap-2 text-left",
          !selected && "text-[var(--muted)]",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onFocus={showPopup}
      >
        <span className="truncate tabular-nums">{display}</span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-[232px] rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-lg"
          onMouseEnter={showPopup}
          onMouseLeave={hidePopupSoon}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              className="btn-icon h-6 w-6 text-sm"
              disabled={disabled}
              onClick={() =>
                setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
              }
              aria-label="Предыдущий месяц"
            >
              ‹
            </button>
            <span className="text-xs font-medium">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </span>
            <button
              type="button"
              className="btn-icon h-6 w-6 text-sm"
              disabled={disabled}
              onClick={() =>
                setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
              }
              aria-label="Следующий месяц"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px text-center text-[9px] uppercase tracking-wide text-[var(--muted)]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-0.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {cells.map(({ key, day }) => {
              if (!day) return <div key={key} className="h-7" />;
              const isSel = selected ? sameDay(day, selected) : false;
              const today = sameDay(day, new Date());
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(formatRuDate(startOfDay(day)));
                    setOpen(false);
                  }}
                  className={cn(
                    "flex h-7 items-center justify-center rounded text-xs tabular-nums transition-colors",
                    "hover:bg-[var(--accent)]/15 disabled:opacity-40",
                    today && !isSel && "ring-1 ring-[var(--line)]",
                    isSel && "bg-[var(--accent)] font-medium text-white",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {selected && !disabled && (
            <button
              type="button"
              className="mt-1.5 text-[10px] text-[var(--accent-deep)] hover:underline"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Очистить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
