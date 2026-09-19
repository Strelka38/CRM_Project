"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FILE_ACCEPT,
  IconAttachPlus,
  IconPaperclip,
  isChatImageFile,
  useFileDrop,
} from "@/components/FileDrop";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DuplicateQuoteModal } from "@/components/QuoteTemplateActions";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { PeekHeader, lifecycleLabel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { unscheduleQuotePatch } from "@/lib/calendar-event-actions";
import {
  endDateFromDuration,
  formatRuDate,
  parseEventDate,
} from "@/lib/dates";
import { isQuoteOwnerRole, roleLabelRu } from "@/lib/roles";
import { whoWorksView, type WhoWorksLine } from "@/lib/quote-assignment-days";

type Assignment = {
  id: string;
  userId?: string | null;
  isFreelancer?: boolean;
  freelancerName?: string;
  kind?: string;
  dayIndex?: number | null;
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
  recommendedMountSlots?: number;
  isManager: boolean;
  canManageAssignments?: boolean;
  canEditBrief?: boolean;
  canManageAttachments?: boolean;
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
  invoiceSent?: boolean;
  uploader: { id: string; name: string };
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

function WhoWorksLines({ lines }: { lines: WhoWorksLine[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {lines.map((line) => (
        <li
          key={line.id}
          className="flex items-baseline justify-between gap-2 border-b border-[var(--line)]/60 py-1"
        >
          <span className={line.vacant ? "text-[var(--muted)]" : undefined}>
            {line.vacant ? line.text : line.name}
            {line.freelancer && (
              <span className="ml-1 text-caption text-[var(--muted)]">фр.</span>
            )}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {line.vacant
              ? ""
              : [line.role, line.detail].filter(Boolean).join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
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
  open,
  onClose,
  embedded = false,
  onChanged,
  onCopied,
}: {
  quoteId: string | null;
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  onChanged?: () => void;
  onCopied?: (id: string) => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [brief, setBrief] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [filesError, setFilesError] = useState("");
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
  const [editing, setEditing] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [briefSaved, setBriefSaved] = useState(false);
  const [briefError, setBriefError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatImageRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const savedBriefRef = useRef("");

  const load = useCallback(async () => {
    if (!quoteId) return;
    setLoading(true);
    setError("");
    setFilesError("");
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
      if (cRes.ok) {
        const data: unknown = await cRes.json().catch(() => []);
        setComments(Array.isArray(data) ? (data as Comment[]) : []);
      } else {
        setComments([]);
      }
      if (aRes.ok) {
        const data: unknown = await aRes.json().catch(() => []);
        setAttachments(Array.isArray(data) ? (data as Attachment[]) : []);
      } else {
        setAttachments([]);
        setFilesError("Не удалось загрузить файлы");
      }
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    if (!open || !quoteId) return;
    void load();
  }, [load, open, quoteId]);

  useEffect(() => {
    setEditing(false);
    setCopyOpen(false);
    setDeleteOpen(false);
    setDeleteError("");
  }, [quoteId, open]);

  useEffect(() => {
    if (!open || !project?.isManager) return;
    let cancelled = false;
    void fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          list: Array<{
            id: string;
            name: string;
            role: string;
            active: boolean;
          }>,
        ) => {
          if (cancelled || !Array.isArray(list)) return;
          setManagers(
            list
              .filter((u) => isQuoteOwnerRole(u.role) && u.active)
              .map((u) => ({ id: u.id, name: u.name })),
          );
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, project?.isManager]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    if (!open || !quoteId) return;
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
  }, [quoteId, open]);

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
    if (!editing || !project?.canEditBrief) return;
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
  }, [brief, editing, project?.canEditBrief, quoteId]);

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
    if (!isChatImageFile(file)) {
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

  async function uploadFiles(list: File[]) {
    if (list.length === 0) return;
    setUploading(true);
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
          alert(
            typeof data.error === "string" ? data.error : "Не удалось загрузить",
          );
          return;
        }
        const created = (await res.json()) as Attachment;
        setAttachments((prev) => [
          created,
          ...prev.filter((a) => a.id !== created.id),
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(id: string) {
    if (!confirm("Удалить файл?")) return;
    const res = await fetch(
      `/api/quotes/${quoteId}/attachments?attachmentId=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      if (preview?.id === id) setPreview(null);
    }
  }

  async function toggleInvoiceSent(a: Attachment) {
    if (!quoteId || !project?.isManager) return;
    const next = !a.invoiceSent;
    setAttachments((prev) =>
      prev.map((f) => ({
        ...f,
        invoiceSent: f.id === a.id ? next : next ? false : f.invoiceSent,
      })),
    );
    const res = await fetch(`/api/quotes/${quoteId}/attachments/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceSent: next }),
    });
    if (!res.ok) {
      await load();
    }
  }

  const fileUrl = (a: Attachment) =>
    `/api/quotes/${quoteId}/attachments/${a.id}/file`;

  const commentImageUrl = (c: Comment) =>
    `/api/quotes/${quoteId}/comments/${c.id}/file`;

  const managerLabel = project ? projectManagerName(project) : "";
  const periodLabel = project ? eventPeriodLabel(project) : "";
  const canSend = Boolean(commentText.trim() || pendingImage);
  const canManageAttachments =
    editing &&
    Boolean(project?.canManageAttachments ?? project?.isManager);
  const canEditBriefNow = editing && Boolean(project?.canEditBrief);
  const showFinanceLinks = editing && Boolean(project?.isManager);
  const showEventMenu = Boolean(
    project && (project.canEditBrief || project.isManager),
  );

  async function unscheduleEvent() {
    if (!quoteId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unscheduleQuotePatch()),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setDeleteError(
          typeof data?.error === "string"
            ? data.error
            : "Не удалось убрать мероприятие из календаря",
        );
        return;
      }
      setDeleteOpen(false);
      onChanged?.();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  function handleChatFiles(list: File[]) {
    if (list.length === 0) return;
    const images = list.filter(isChatImageFile);
    const docs = list.filter((f) => !isChatImageFile(f));
    if (images[0]) onPickChatImage(images[0]);
    const rest = [...images.slice(1), ...docs];
    if (rest.length === 0) return;
    if (canManageAttachments) {
      void uploadFiles(rest);
      return;
    }
    if (!images[0]) {
      alert(
        "В чат можно перетащить фото (png, jpg). PDF и Excel — в блок «Файлы».",
      );
    }
  }

  const { dragOver: fileDragOver, dropProps: fileDropProps } = useFileDrop(
    canManageAttachments && !uploading,
    (list) => {
      void uploadFiles(list);
    },
  );
  const { dragOver: chatDragOver, dropProps: chatDropProps } = useFileDrop(
    Boolean(project),
    handleChatFiles,
  );

  return (
    <>
      <SideDrawer
        open={open}
        onClose={onClose}
        wide={!embedded}
        labelledBy="project-title"
        zIndex={55}
        embedded={embedded}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <PeekHeader
            onClose={onClose}
            kind="Проект"
            kindId="project-kind"
            menuItems={
              showEventMenu
                ? [
                    {
                      id: "edit",
                      label: "Edit",
                      hidden: !project?.canEditBrief,
                      disabled: editing,
                      onSelect: () => setEditing(true),
                    },
                    {
                      id: "copy",
                      label: "Copy",
                      hidden: !project?.isManager,
                      onSelect: () => setCopyOpen(true),
                    },
                    {
                      id: "delete",
                      label: "Delete",
                      danger: true,
                      hidden: !project?.isManager,
                      onSelect: () => setDeleteOpen(true),
                    },
                  ]
                : undefined
            }
          >
            {loading ? (
              <p className="text-sm text-[var(--muted)]">Загрузка…</p>
            ) : project ? (
              <>
                <h2
                  id="project-title"
                  className="font-display text-base font-medium leading-snug text-[var(--ink)]"
                >
                  {project.eventName || project.client || "Без названия"}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  №{project.proposalNumber}
                  {project.time ? ` · ${project.time}` : ""}
                  {project.place ? ` · ${project.place}` : ""}
                  {" · "}
                  {lifecycleLabel(project.lifecycle)}
                </p>
                <div className="mt-1.5 space-y-0.5 text-sm">
                  {periodLabel && (
                    <p>
                      <span className="text-[var(--muted)]">Даты: </span>
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
                  {managerLabel ? (
                    <p>
                      <span className="text-[var(--muted)]">Менеджер: </span>
                      <span className="text-[var(--ink)]">{managerLabel}</span>
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--danger)]">{error || "Ошибка"}</p>
            )}
          </PeekHeader>

          {project && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <section>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      ТЗ к мероприятию
                    </h3>
                    {canEditBriefNow && briefSaved && (
                      <span className="text-caption text-[var(--muted)]">
                        сохранено
                      </span>
                    )}
                  </div>
                  {canEditBriefNow ? (
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

                {attachments.length > 0 || canManageAttachments ? (
                <section
                  className={cn(
                    "rounded-lg border px-2.5 py-2 transition-colors",
                    canManageAttachments ? "border-dashed" : "border-solid",
                    fileDragOver
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--line)]",
                  )}
                  {...(canManageAttachments ? fileDropProps : {})}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Файлы
                      {attachments.length > 0 ? ` · ${attachments.length}` : ""}
                    </h3>
                    {canManageAttachments ? (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          multiple
                          accept={FILE_ACCEPT}
                          className="hidden"
                          onChange={(e) => {
                            void uploadFiles(Array.from(e.target.files ?? []));
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={uploading}
                          title="Прикрепить файл"
                          aria-label="Прикрепить файл"
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-40"
                        >
                          <IconAttachPlus />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {filesError ? (
                    <p className="text-sm text-[var(--danger)]">{filesError}</p>
                  ) : (
                    <>
                      {attachments.length === 0 ? (
                        <p className="text-sm text-[var(--muted)]">
                          {canManageAttachments
                            ? fileDragOver
                              ? "Отпустите, чтобы прикрепить"
                              : "PDF, Excel или фото — перетащите сюда"
                            : "Нет вложений"}
                        </p>
                      ) : fileDragOver ? (
                        <p className="mb-2 text-sm text-[var(--accent)]">
                          Отпустите, чтобы прикрепить
                        </p>
                      ) : null}
                      {attachments.length > 0 ? (
                    <ul className="space-y-2">
                      {attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2 text-sm"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
                              checked={Boolean(a.invoiceSent)}
                              disabled={!editing || !project.isManager}
                              title="Счёт отправлен"
                              aria-label="Счёт отправлен"
                              onChange={() => void toggleInvoiceSent(a)}
                            />
                            <button
                              type="button"
                              className="min-w-0 truncate text-left hover:text-[var(--accent)]"
                              onClick={() => setPreview(a)}
                              title={a.filename}
                            >
                              {a.filename}
                              <span className="ml-2 text-caption text-[var(--muted)]">
                                {formatBytes(a.size)}
                              </span>
                              {a.invoiceSent ? (
                                <span className="ml-2 text-caption text-[var(--accent)]">
                                  счёт отправлен
                                </span>
                              ) : null}
                            </button>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <a
                              href={fileUrl(a)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                            >
                              Открыть
                            </a>
                            {canManageAttachments ? (
                              <button
                                type="button"
                                className="text-xs text-[var(--danger)]"
                                onClick={() => void removeAttachment(a.id)}
                              >
                                Удал.
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                      ) : null}
                    </>
                  )}
                </section>
                ) : null}

                <section className="space-y-4">
                      <div>
                        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                          {project.canManageAssignments && !project.isManager
                            ? "Кто требуется / назначен"
                            : "Кто работает"}
                        </h3>
                        {(() => {
                          const who = whoWorksView(
                            project.assignments,
                            project.durationDays,
                            project.date,
                          );
                          if (who.lines.length === 0) {
                            return (
                              <p className="text-sm text-[var(--muted)]">
                                Никто не назначен
                              </p>
                            );
                          }
                          return <WhoWorksLines lines={who.lines} />;
                        })()}
                      </div>
                      <div>
                        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                          Монтажники
                          {project.recommendedMountSlots
                            ? ` · смета ${project.recommendedMountSlots}`
                            : ""}
                        </h3>
                        {project.assignments.filter(
                          (a) => a.kind === "MOUNT",
                        ).length === 0 ? (
                          <p className="text-sm text-[var(--muted)]">
                            Монтажники не назначены
                          </p>
                        ) : (
                          <ul className="space-y-1.5 text-sm">
                            {project.assignments
                              .filter((a) => a.kind === "MOUNT")
                              .map((a) => {
                                const vacant = !a.userId && !a.isFreelancer;
                                const fl = Boolean(a.isFreelancer);
                                const name = vacant
                                  ? "не назначен"
                                  : fl
                                    ? (a.freelancerName || "").trim() ||
                                      "Фрилансер"
                                    : a.user
                                      ? personName(a.user)
                                      : "не назначен";
                                return (
                                  <li
                                    key={a.id}
                                    className="flex items-baseline justify-between gap-2 border-b border-[var(--line)]/60 py-1"
                                  >
                                    <span
                                      className={
                                        vacant
                                          ? "text-[var(--muted)]"
                                          : undefined
                                      }
                                    >
                                      {name}
                                      {fl && (
                                        <span className="ml-1 text-caption text-[var(--muted)]">
                                          фр.
                                        </span>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                      </div>
                </section>

                <div className="flex flex-wrap gap-2 pt-1">
                  {showFinanceLinks && (
                    <>
                      <Link
                        href={`/quotes/${project.id}`}
                        className="rounded-md bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)]"
                      >
                        Смета
                      </Link>
                      <Link
                        href={`/calculations/${project.id}`}
                        className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
                      >
                        Калькуляция
                      </Link>
                    </>
                  )}
                  <Link
                    href={`/quotes/${project.id}/spec`}
                    className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white"
                  >
                    Спецификация
                  </Link>
                </div>
              </div>

              <div
                className={cn(
                  "shrink-0 border-t bg-[var(--panel)] px-4 py-3 transition-colors",
                  chatDragOver
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--line)]",
                )}
                {...chatDropProps}
              >
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                  Комментарии
                </h3>
                {chatDragOver ? (
                  <p className="mb-2 text-caption text-[var(--accent)]">
                    Отпустите фото или файл
                  </p>
                ) : null}

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
                          <span className="text-caption text-[var(--muted)]">
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
                        className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-caption text-white"
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
                    multiple
                    accept={FILE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      handleChatFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    title="Прикрепить фото или файл"
                    aria-label="Прикрепить фото или файл"
                    onClick={() => chatImageRef.current?.click()}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    <IconPaperclip />
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
      </SideDrawer>

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

      {project && quoteId ? (
        <DuplicateQuoteModal
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          quoteId={quoteId}
          managers={
            managers.length
              ? managers
              : project.owner
                ? [
                    {
                      id: project.owner.id,
                      name: personName(project.owner),
                    },
                  ]
                : []
          }
          defaultOwnerId={project.owner?.id || managers[0]?.id || ""}
          initialDate={project.date}
          initialDays={project.durationDays || 1}
          onCreated={(id) => {
            setCopyOpen(false);
            onChanged?.();
            onCopied?.(id);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        title="Убрать из календаря"
        message={
          deleteError ||
          "Даты сметы будут очищены, статус станет «Отменено». Мероприятие уйдёт из календаря в раздел «Сметы» своего менеджера."
        }
        confirmLabel="Убрать"
        busy={deleting}
        onConfirm={() => void unscheduleEvent()}
        onCancel={() => {
          if (!deleting) {
            setDeleteOpen(false);
            setDeleteError("");
          }
        }}
      />
    </>
  );
}
