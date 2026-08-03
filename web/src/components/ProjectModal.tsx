"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { QuoteAssignments } from "@/components/QuoteAssignments";
import {
  endDateFromDuration,
  formatRuDate,
  parseEventDate,
} from "@/lib/dates";
import { roleLabelRu } from "@/lib/roles";

type Assignment = {
  id: string;
  userId?: string | null;
  isFreelancer?: boolean;
  freelancerName?: string;
  user: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
  } | null;
  specialty: { id: string; name: string };
};

type Project = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  mountDate: string;
  mountDurationDays: number;
  demountDate: string;
  demountDurationDays: number;
  time: string;
  place: string;
  client: string;
  managerName: string;
  brief: string;
  lifecycle: string;
  durationDays: number;
  owner: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
  } | null;
  assignments: Assignment[];
  isManager: boolean;
  canManageAssignments?: boolean;
  canEditBrief?: boolean;
};

type Comment = {
  id: string;
  body: string;
  hasImage?: boolean;
  imageMime?: string | null;
  imageName?: string | null;
  createdAt: string;
  author: { id: string; name: string; role: string };
};

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploader: { id: string; name: string };
};

const LIFE_LABEL: Record<string, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено",
  COMPLETED: "Завершено",
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function personName(u: {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const full = [u.lastName, u.firstName].filter(Boolean).join(" ");
  return full || u.name;
}

function projectManagerName(p: Project) {
  if (p.owner) return personName(p.owner);
  return p.managerName?.trim() || "";
}

function dateRangeLabel(date: string, durationDays: number) {
  const start = parseEventDate(date);
  if (!start) return date?.trim() || "";
  const days = Math.max(1, durationDays || 1);
  if (days <= 1) return formatRuDate(start);
  const end = endDateFromDuration(start, days);
  return `${formatRuDate(start)} — ${formatRuDate(end)}`;
}

function eventPeriodLabel(p: Project) {
  return dateRangeLabel(p.date, p.durationDays);
}

function isImage(mime: string) {
  return mime === "image/png" || mime === "image/jpeg";
}

function isPdf(mime: string) {
  return mime === "application/pdf";
}

function isExcel(mime: string) {
  return (
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  );
}

export function ProjectModal({
  quoteId,
  onClose,
}: {
  quoteId: string;
  onClose: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [brief, setBrief] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [chatImage, setChatImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [briefSaved, setBriefSaved] = useState(false);
  const [briefError, setBriefError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatImageRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const savedBriefRef = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pRes, cRes, aRes] = await Promise.all([
        fetch(`/api/quotes/${quoteId}/project`),
        fetch(`/api/quotes/${quoteId}/comments`),
        fetch(`/api/quotes/${quoteId}/attachments`),
      ]);
      if (!pRes.ok) {
        const data = (await pRes.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;
        const base =
          pRes.status === 404
            ? "Мероприятие не найдено"
            : typeof data?.error === "string"
              ? data.error
              : "Не удалось загрузить мероприятие";
        setError(
          data?.detail ? `${base}: ${data.detail.slice(0, 180)}` : base,
        );
        setProject(null);
        return;
      }
      const p = (await pRes.json()) as Project;
      setProject(p);
      setBrief(p.brief || "");
      savedBriefRef.current = p.brief || "";
      setComments(cRes.ok ? await cRes.json() : []);
      setAttachments(aRes.ok ? await aRes.json() : []);
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    const tick = async () => {
      const res = await fetch(`/api/quotes/${quoteId}/comments`);
      if (!res.ok) return;
      const data = (await res.json()) as Comment[];
      setComments((prev) => {
        if (
          prev.length === data.length &&
          prev.every(
            (c, i) =>
              c.id === data[i]?.id &&
              Boolean(c.hasImage) === Boolean(data[i]?.hasImage),
          )
        ) {
          return prev;
        }
        return data;
      });
    };
    const id = window.setInterval(() => void tick(), 8000);
    return () => window.clearInterval(id);
  }, [quoteId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (chatImage) {
        setChatImage(null);
        return;
      }
      if (preview) {
        setPreview(null);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview, chatImage]);

  useEffect(() => {
    if (!project?.canEditBrief) return;
    if (brief === savedBriefRef.current) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/quotes/${quoteId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      if (res.ok) {
        savedBriefRef.current = brief;
        setProject((prev) => (prev ? { ...prev, brief } : prev));
        setBriefError("");
        setBriefSaved(true);
        setTimeout(() => setBriefSaved(false), 1500);
      } else {
        setBriefError("Не удалось сохранить ТЗ");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [brief, project?.canEditBrief, quoteId]);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  function clearPendingImage() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingImage(null);
    setPendingPreview(null);
  }

  function onPickChatImage(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Можно прикрепить только изображение (png, jpg)");
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingImage(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function sendComment() {
    const body = commentText.trim();
    if ((!body && !pendingImage) || sending) return;
    setSending(true);
    try {
      let res: Response;
      if (pendingImage) {
        const fd = new FormData();
        fd.set("body", body);
        fd.set("image", pendingImage);
        res = await fetch(`/api/quotes/${quoteId}/comments`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/quotes/${quoteId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(
          typeof data.error === "string"
            ? data.error
            : "Не удалось отправить",
        );
        return;
      }
      const created = (await res.json()) as Comment;
      setComments((prev) => [...prev, created]);
      setCommentText("");
      clearPendingImage();
    } finally {
      setSending(false);
    }
  }

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/quotes/${quoteId}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(
          typeof data.error === "string" ? data.error : "Не удалось загрузить",
        );
        return;
      }
      const created = (await res.json()) as Attachment;
      setAttachments((prev) => [created, ...prev]);
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id: string) {
    if (!confirm("Удалить файл?")) return;
    const res = await fetch(
      `/api/quotes/${quoteId}/attachments?attachmentId=${id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      if (preview?.id === id) setPreview(null);
    }
  }

  const fileUrl = (a: Attachment) =>
    `/api/quotes/${quoteId}/attachments/${a.id}/file`;

  const commentImageUrl = (c: Comment) =>
    `/api/quotes/${quoteId}/comments/${c.id}/file`;

  const managerLabel = project ? projectManagerName(project) : "";
  const periodLabel = project ? eventPeriodLabel(project) : "";
  const canSend = Boolean(commentText.trim() || pendingImage);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Мероприятие"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Мероприятие
              </p>
              {loading ? (
                <p className="text-[var(--muted)]">Загрузка…</p>
              ) : project ? (
                <>
                  <h2 className="font-display truncate text-2xl text-[var(--ink)]">
                    {project.eventName || project.client || "Без названия"}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    №{project.proposalNumber}
                    {project.time ? ` · ${project.time}` : ""}
                    {project.place ? ` · ${project.place}` : ""}
                    {" · "}
                    {LIFE_LABEL[project.lifecycle] || project.lifecycle}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                    {periodLabel && (
                      <p>
                        <span className="text-[var(--muted)]">Мероприятие: </span>
                        <span className="text-[var(--ink)]">{periodLabel}</span>
                      </p>
                    )}
                    <p>
                      <span className="text-[var(--muted)]">Монтаж: </span>
                      <span className="text-[var(--ink)]">
                        {dateRangeLabel(
                          project.mountDate,
                          project.mountDurationDays,
                        ) || "—"}
                      </span>
                    </p>
                    <p>
                      <span className="text-[var(--muted)]">Демонтаж: </span>
                      <span className="text-[var(--ink)]">
                        {dateRangeLabel(
                          project.demountDate,
                          project.demountDurationDays,
                        ) || "—"}
                      </span>
                    </p>
                  </div>
                  {managerLabel && (
                    <p className="mt-0.5 text-sm text-[var(--ink)]">
                      <span className="text-[var(--muted)]">Менеджер: </span>
                      {managerLabel}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[var(--danger)]">{error || "Ошибка"}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Закрыть
            </button>
          </div>

          {project && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <section>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      ТЗ к мероприятию
                    </h3>
                    {project.canEditBrief && briefSaved && (
                      <span className="text-[10px] text-[var(--muted)]">
                        сохранено
                      </span>
                    )}
                  </div>
                  {project.canEditBrief ? (
                    <>
                      <textarea
                        className="field min-h-[96px] resize-y"
                        placeholder="Кратко опишите задачу…"
                        value={brief}
                        onChange={(e) => {
                          setBrief(e.target.value);
                          setBriefError("");
                        }}
                      />
                      {briefError && (
                        <p className="mt-1 text-xs text-[var(--danger)]">
                          {briefError}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
                      {project.brief?.trim() || "ТЗ пока не заполнено"}
                    </p>
                  )}
                </section>

                <section>
                  {project.canManageAssignments && !project.isManager ? (
                    <QuoteAssignments
                      quoteId={quoteId}
                      canEdit
                      compact
                      hidePay
                    />
                  ) : (
                    <>
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                        Кто работает
                      </h3>
                      {project.assignments.length === 0 ? (
                        <p className="text-sm text-[var(--muted)]">
                          Никто не назначен
                        </p>
                      ) : (
                        <ul className="space-y-1.5 text-sm">
                          {project.assignments.map((a) => {
                            const fl = a.isFreelancer || !a.userId || !a.user;
                            const name = fl
                              ? (a.freelancerName || "").trim() || "Фрилансер"
                              : personName(a.user!);
                            return (
                              <li
                                key={a.id}
                                className="flex items-baseline justify-between gap-2 border-b border-[var(--line)]/60 py-1"
                              >
                                <span>
                                  {name}
                                  {fl && (
                                    <span className="ml-1 text-[10px] text-[var(--muted)]">
                                      фр.
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-[var(--muted)]">
                                  {a.specialty.name}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Файлы
                    </h3>
                    {project.isManager && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void onUpload(f);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => fileRef.current?.click()}
                          className="text-xs text-[var(--accent)] disabled:opacity-40"
                        >
                          {uploading ? "Загрузка…" : "+ Прикрепить"}
                        </button>
                      </>
                    )}
                  </div>
                  {attachments.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">Нет вложений</p>
                  ) : (
                    <ul className="space-y-2">
                      {attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2 text-sm"
                        >
                          <button
                            type="button"
                            className="min-w-0 truncate text-left hover:text-[var(--accent)]"
                            onClick={() => setPreview(a)}
                            title={a.filename}
                          >
                            {a.filename}
                            <span className="ml-2 text-[10px] text-[var(--muted)]">
                              {formatBytes(a.size)}
                            </span>
                          </button>
                          <div className="flex shrink-0 gap-2">
                            <a
                              href={fileUrl(a)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                            >
                              Открыть
                            </a>
                            {project.isManager && (
                              <button
                                type="button"
                                className="text-xs text-[var(--danger)]"
                                onClick={() => void removeAttachment(a.id)}
                              >
                                Удал.
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="flex flex-wrap gap-2 pt-1">
                  {project.isManager && (
                    <Link
                      href={`/quotes/${project.id}`}
                      className="rounded-md bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)]"
                    >
                      Смета
                    </Link>
                  )}
                  <Link
                    href={`/quotes/${project.id}/spec`}
                    className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
                  >
                    Спецификация
                  </Link>
                </div>
              </div>

              <div className="shrink-0 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Комментарии
                </h3>

                {comments.length > 0 && (
                  <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2">
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-2 text-sm"
                      >
                        <div className="mb-0.5 flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium">
                            {c.author.name}
                            <span className="ml-1 font-normal text-[var(--muted)]">
                              {roleLabelRu(c.author.role)}
                            </span>
                          </span>
                          <span className="text-[10px] text-[var(--muted)]">
                            {new Date(c.createdAt).toLocaleString("ru-RU", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {c.body?.trim() && (
                          <p className="whitespace-pre-wrap">{c.body}</p>
                        )}
                        {c.hasImage && (
                          <button
                            type="button"
                            className="mt-1.5 block overflow-hidden rounded-md border border-[var(--line)]"
                            onClick={() =>
                              setChatImage({
                                url: commentImageUrl(c),
                                name: c.imageName || "Фото",
                              })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={commentImageUrl(c)}
                              alt={c.imageName || "Фото"}
                              className="max-h-40 max-w-full object-contain"
                            />
                          </button>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {pendingPreview && (
                  <div className="mb-2 flex items-start gap-2">
                    <div className="relative overflow-hidden rounded-md border border-[var(--line)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pendingPreview}
                        alt="Превью"
                        className="max-h-24 max-w-[10rem] object-contain"
                      />
                      <button
                        type="button"
                        onClick={clearPendingImage}
                        className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    ref={chatImageRef}
                    type="file"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickChatImage(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    title="Прикрепить картинку"
                    onClick={() => chatImageRef.current?.click()}
                    className="shrink-0 rounded-md border border-[var(--line)] px-2.5 py-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Фото
                  </button>
                  <input
                    className="field flex-1"
                    placeholder={
                      comments.length === 0
                        ? "Написать первый комментарий…"
                        : "Написать комментарий…"
                    }
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendComment();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={sending || !canSend}
                    onClick={() => void sendComment()}
                    className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <p className="truncate text-sm font-medium">{preview.filename}</p>
              <button
                type="button"
                className="text-sm text-[var(--muted)]"
                onClick={() => setPreview(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {isImage(preview.mimeType) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(preview)}
                  alt={preview.filename}
                  className="mx-auto max-h-[75vh] max-w-full object-contain"
                />
              )}
              {isPdf(preview.mimeType) && (
                <iframe
                  title={preview.filename}
                  src={fileUrl(preview)}
                  className="h-[75vh] w-full rounded border border-[var(--line)]"
                />
              )}
              {(isExcel(preview.mimeType) ||
                (!isImage(preview.mimeType) && !isPdf(preview.mimeType))) && (
                <div className="flex flex-col items-start gap-3 py-8">
                  <p className="text-sm text-[var(--muted)]">
                    {isExcel(preview.mimeType)
                      ? "Предпросмотр Excel недоступен в браузере. Скачайте файл."
                      : "Предпросмотр недоступен. Скачайте или откройте файл."}
                  </p>
                  <a
                    href={fileUrl(preview)}
                    download={preview.filename}
                    className="rounded-md bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)]"
                  >
                    Скачать {preview.filename}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {chatImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setChatImage(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
              <p className="truncate text-sm font-medium">{chatImage.name}</p>
              <button
                type="button"
                className="text-sm text-[var(--muted)]"
                onClick={() => setChatImage(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chatImage.url}
                alt={chatImage.name}
                className="mx-auto max-h-[75vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
