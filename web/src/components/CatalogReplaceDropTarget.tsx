"use client";

import { useState } from "react";
import type { PickedCatalogItem } from "@/components/CatalogPicker";
import {
  isCatalogDrag,
  parseCatalogDrag,
  relatedTargetStillInside,
} from "@/lib/catalog-dnd";
import { cn } from "@/lib/cn";

export function CatalogReplaceDropTarget({
  onReplace,
  onDragActiveChange,
  disabled = false,
}: {
  onReplace: (item: PickedCatalogItem) => void;
  onDragActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);

  if (disabled) {
    return <span className="block size-7" aria-hidden />;
  }

  return (
    <span
      role="button"
      tabIndex={-1}
      title="Перетащите сюда позицию из каталога для замены"
      aria-label="Поле замены позиции из каталога"
      onDragEnter={(event) => {
        if (!isCatalogDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(true);
        onDragActiveChange?.(true);
      }}
      onDragOver={(event) => {
        if (!isCatalogDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        if (!over) {
          setOver(true);
          onDragActiveChange?.(true);
        }
      }}
      onDragLeave={(event) => {
        if (relatedTargetStillInside(event.currentTarget, event.relatedTarget)) {
          return;
        }
        event.stopPropagation();
        setOver(false);
        onDragActiveChange?.(false);
      }}
      onDrop={(event) => {
        if (!isCatalogDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const payload = parseCatalogDrag(event.dataTransfer);
        setOver(false);
        onDragActiveChange?.(false);
        if (payload) onReplace(payload.item);
      }}
      className={cn(
        "mx-auto flex size-7 items-center justify-center rounded-md border border-dashed border-[var(--line)] bg-[var(--panel)] text-sm text-[var(--muted)] transition-[border-color,background-color,color,transform] duration-150",
        over &&
          "scale-110 border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]",
      )}
    >
      ⇄
    </span>
  );
}
