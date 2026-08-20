"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

const ACCEPT =
  ".pdf,.xlsx,.xls,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileUrl(quoteId: string, id: string) {
  return `/api/quotes/${quoteId}/attachments/${id}/file`;
}

export function QuoteFilesField({
  quoteId,
  canEdit = false,
}: {
  quoteId: string;
  canEdit?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/quotes/${quoteId}/attachments`);
    if (res.ok) {
      const data: unknown = await res.json();
      setFiles(Array.isArray(data) ? (data as Attachment[]) : []);
    }
    setLoading(false);
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadAll(list: File[]) {
    if (!canEdit || list.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`/api/quotes/${quoteId}/attachments`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            typeof data.error === "string"
              ? data.error
              : "Не удалось загрузить файл",
          );
          return;
        }
        const created = (await res.json()) as Attachment;
        setFiles((prev) => [created, ...prev.filter((f) => f.id !== created.id)]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(id: string) {
    if (!confirm("Удалить файл?")) return;
    const res = await fetch(
      `/api/quotes/${quoteId}/attachments?attachmentId=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError("Не удалось удалить файл");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed px-2.5 py-2",
        dragOver
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--line)]",
      )}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragOver(false);
        void uploadAll(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--muted)]">
          Файлы
          {files.length > 0 ? ` · ${files.length}` : ""}
        </p>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                void uploadAll(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="text-[11px] text-[var(--accent)] disabled:opacity-40"
            >
              {uploading ? "Загрузка…" : "+ Прикрепить"}
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p>
      ) : null}
      {loading ? (
        <p className="mt-1 text-[11px] text-[var(--muted)]">Загрузка…</p>
      ) : files.length === 0 ? (
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          PDF, Excel или фото — появятся в мини-окне календаря
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {files.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <a
                href={fileUrl(quoteId, a.id)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate hover:text-[var(--accent)]"
                title={a.filename}
              >
                {a.filename}
                <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                  {formatBytes(a.size)}
                </span>
              </a>
              {canEdit ? (
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-[var(--danger)]"
                  onClick={() => void removeFile(a.id)}
                >
                  Удалить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
