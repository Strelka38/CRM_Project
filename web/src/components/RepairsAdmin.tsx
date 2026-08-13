"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Modal, PageHeader } from "@/components/ui";
import { formatUnitId } from "@/lib/equipment-id";
import { faultTypeLabel } from "@/lib/equipment-repairs";

type RepairRow = {
  id: string;
  faultType: string;
  comment: string;
  reportedAt: string;
  reportedBy: { id: string; name: string; firstName: string; lastName: string };
  photos: { id: string; filename: string }[];
  unit: {
    id: string;
    unitNumber: number;
    qrToken: string;
    label: string | null;
    catalogItem: {
      id: string;
      name: string;
      model: string | null;
      equipmentCode: number | null;
      category: { path: string } | null;
    };
  };
};

function fmtDt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reporterName(u: RepairRow["reportedBy"]) {
  const fio = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return fio || u.name;
}

export function RepairsAdmin() {
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [returnTarget, setReturnTarget] = useState<RepairRow | null>(null);
  const [resolutionComment, setResolutionComment] = useState("");
  const [returnError, setReturnError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/repairs", { credentials: "same-origin" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось загрузить раздел");
        setRows([]);
        return;
      }
      setRows(await res.json());
    } catch {
      setError("Не удалось загрузить раздел");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openReturn(row: RepairRow) {
    setReturnTarget(row);
    setResolutionComment("");
    setReturnError("");
  }

  async function resolve() {
    if (!returnTarget) return;
    const conclusion = resolutionComment.trim();
    if (!conclusion) {
      setReturnError("Напишите заключение сервиса");
      return;
    }
    setBusyId(returnTarget.id);
    setReturnError("");
    setError("");
    try {
      const res = await fetch(`/api/repairs/${returnTarget.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolve: true, resolutionComment: conclusion }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReturnError(data.error || "Не удалось вернуть из ремонта");
        return;
      }
      setReturnTarget(null);
      setResolutionComment("");
      await load();
    } catch {
      setReturnError("Не удалось вернуть из ремонта");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <PageHeader
        eyebrow="База данных"
        title="Ремонт"
        subtitle="Единицы, списанные со склада. История поломки закреплена за ID единицы."
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Загрузка…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Сейчас ничего не в ремонте"
          description="Когда сотрудник спишет единицу с QR-страницы, она появится здесь."
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const unitId = formatUnitId(
              r.unit.catalogItem.equipmentCode,
              r.unit.unitNumber,
            );
            return (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      {r.unit.catalogItem.category?.path || "Оборудование"}
                    </p>
                    <h2 className="mt-0.5 text-lg font-medium text-[var(--ink)]">
                      {r.unit.catalogItem.name}
                      {r.unit.catalogItem.model ? (
                        <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                          {r.unit.catalogItem.model}
                        </span>
                      ) : null}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      ID единицы{" "}
                      <span className="font-medium tabular-nums text-[var(--ink)]">
                        {unitId}
                      </span>
                      {r.unit.label ? ` · ${r.unit.label}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/q/${r.unit.qrToken}`}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)]"
                    >
                      Карточка
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === r.id}
                      onClick={() => openReturn(r)}
                    >
                      {busyId === r.id ? "Возврат…" : "Вернуть на склад"}
                    </Button>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Тип поломки</dt>
                    <dd className="mt-0.5 text-[var(--ink)]">
                      {faultTypeLabel(r.faultType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Дата</dt>
                    <dd className="mt-0.5 text-[var(--ink)]">
                      {fmtDt(r.reportedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--muted)]">Кто указал</dt>
                    <dd className="mt-0.5 text-[var(--ink)]">
                      {reporterName(r.reportedBy)}
                    </dd>
                  </div>
                </dl>
                {r.comment ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--ink)]">
                    {r.comment}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    Без комментария
                  </p>
                )}
                {r.photos.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.photos.map((p) => (
                      <a
                        key={p.id}
                        href={`/api/repairs/${r.id}/photos/${p.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-[var(--line)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/repairs/${r.id}/photos/${p.id}/file`}
                          alt={p.filename}
                          className="h-24 w-24 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!returnTarget}
        onClose={() => {
          if (!busyId) setReturnTarget(null);
        }}
        title="Вернуть на склад"
        className="max-w-md"
      >
        <p className="mt-1 text-sm text-[var(--muted)]">
          Заключение сервиса сохранится в истории поломки
          {returnTarget
            ? ` единицы ${formatUnitId(
                returnTarget.unit.catalogItem.equipmentCode,
                returnTarget.unit.unitNumber,
              )}`
            : ""}
          .
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-[var(--muted)]">Заключение сервиса</span>
          <textarea
            className="field mt-1 min-h-28"
            placeholder="Что сделали, чем закончилось, можно ли выдавать…"
            value={resolutionComment}
            onChange={(e) => setResolutionComment(e.target.value)}
            disabled={!!busyId}
          />
        </label>
        {returnError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{returnError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busyId}
            onClick={() => setReturnTarget(null)}
          >
            Отмена
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!!busyId}
            onClick={() => void resolve()}
          >
            {busyId ? "Возврат…" : "Вернуть на склад"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
