"use client";

import { useRef, useState, type DragEvent } from "react";

export const FILE_ACCEPT =
  ".pdf,.xlsx,.xls,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

export function isFileDragEvent(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export function isChatImageFile(file: File) {
  const type = file.type.toLowerCase();
  if (type === "image/png" || type === "image/jpeg") return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg");
}

export function useFileDrop(
  enabled: boolean,
  onFiles: (files: File[]) => void,
) {
  const [dragOver, setDragOver] = useState(false);
  const depthRef = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  function reset() {
    depthRef.current = 0;
    setDragOver(false);
  }

  return {
    dragOver,
    dropProps: {
      onDragEnter(e: DragEvent) {
        if (!enabled || !isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depthRef.current += 1;
        setDragOver(true);
      },
      onDragOver(e: DragEvent) {
        if (!enabled || !isFileDragEvent(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave(e: DragEvent) {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        depthRef.current -= 1;
        if (depthRef.current <= 0) reset();
      },
      onDrop(e: DragEvent) {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files);
        reset();
        if (files.length) onFilesRef.current(files);
      },
    },
  };
}

export function IconAttachPlus({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className={className ?? "size-5"}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-5"}
      aria-hidden
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
