"use client";

import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  /** Потолок в пикселях. Дальше поле прокручивается, а не растягивает страницу. */
  maxHeight?: number;
};

/** Высота следует за текстом: пустое поле — одна строка, длинное — по содержимому. */
export function AutoTextarea({
  className,
  value,
  maxHeight = 640,
  onChange,
  ...props
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;

    function fit() {
      if (el.clientWidth === 0) return;
      el.style.height = "auto";
      const full = el.scrollHeight;
      el.style.height = `${Math.min(full, maxHeight)}px`;
      el.style.overflowY = full > maxHeight ? "auto" : "hidden";
    }

    fit();
    width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === 0 || el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, maxHeight]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
}
