"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  /** Группа для ↑/↓ между ячейками цены в одной таблице. */
  navGroup?: string;
  min?: number;
  "aria-label"?: string;
};

function toDisplay(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(n);
}

function parsePrice(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function PriceInput({
  value,
  onChange,
  className,
  disabled,
  navGroup = "price",
  min = 0,
  "aria-label": ariaLabel = "Цена",
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  /** Первый клик/фокус: Backspace стирает всё; повторный клик — по цифре. */
  const replaceMode = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : toDisplay(value);

  useLayoutEffect(() => {
    if (!replaceMode.current || draft === null) return;
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    el.select();
  }, [draft]);

  function commit(raw: string) {
    const parsed = parsePrice(raw);
    onChange(parsed == null ? min : Math.max(min, parsed));
    setDraft(null);
  }

  function focusNeighbor(dir: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    const scope = el.closest("table") ?? document;
    const list = Array.from(
      scope.querySelectorAll<HTMLInputElement>(
        `input[data-price-nav="${navGroup}"]`,
      ),
    ).filter((node) => !node.disabled);
    const index = list.indexOf(el);
    if (index < 0) return;
    const next = list[index + dir];
    if (!next) return;
    next.focus();
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      data-price-nav={navGroup}
      disabled={disabled}
      className={cn("field tabular-nums", className)}
      value={display}
      onMouseDown={() => {
        if (document.activeElement === ref.current) {
          replaceMode.current = false;
        }
      }}
      onFocus={() => {
        replaceMode.current = true;
        setDraft(toDisplay(value));
      }}
      onMouseUp={(e) => {
        if (!replaceMode.current) return;
        e.preventDefault();
        e.currentTarget.select();
      }}
      onBlur={(e) => {
        replaceMode.current = false;
        commit(e.currentTarget.value);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && !/^[\d\s.,]*$/.test(raw)) return;
        replaceMode.current = false;
        setDraft(raw);
        const parsed = parsePrice(raw);
        if (parsed != null) onChange(Math.max(min, parsed));
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          commit(e.currentTarget.value);
          focusNeighbor(-1);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          commit(e.currentTarget.value);
          focusNeighbor(1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        if (
          replaceMode.current &&
          (e.key === "Backspace" || e.key === "Delete")
        ) {
          e.preventDefault();
          replaceMode.current = false;
          setDraft("");
          return;
        }
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (replaceMode.current) {
            // Печать поверх выделенного / replace-mode.
            replaceMode.current = false;
          }
        }
      }}
    />
  );
}
