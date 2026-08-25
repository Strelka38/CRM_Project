"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  TableSkeleton,
} from "@/components/ui";
import { EquipmentRepairFormModal } from "@/components/EquipmentRepairFormModal";
import { EquipmentQrScannerModal } from "@/components/EquipmentQrScannerModal";
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

function QrScanIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
      <path
        d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M17 7V4.5A1.5 1.5 0 0 0 15.5 3H13M3 13v2.5A1.5 1.5 0 0 0 4.5 17H7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="6" y="6" width="3.2" height="3.2" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.8" y="6" width="3.2" height="3.2" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6" y="10.8" width="3.2" height="3.2" rx="0.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M11 11h1.4v1.4H11zM14.2 11H15v2.2h-2.2v-.8M11 13.8h1.6V15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function unitTitle(row: RepairRow) {
  return (
    <>
      {row.unit.catalogItem.name}
      {row.unit.catalogItem.model ? ` · ${row.unit.catalogItem.model}` : ""}
    </>
  );
}

function unitIdLabel(row: RepairRow) {
  const id = formatUnitId(row.unit.catalogItem.equipmentCode, row.unit.unitNumber);
  return row.unit.label ? `${id} · ${row.unit.label}` : id;
}

function scrollToRepairRow(id: string) {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-repair-id="${id}"]`);
  const visible = [...nodes].find((node) => node.offsetParent !== null) ?? nodes[0];
  visible?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function RepairsAdmin() {
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [highlightId, setHighlightId] = useState("");
  const [pendingHighlightUnitId, setPendingHighlightUnitId] = useState("");
  const [returnTargets, setReturnTargets] = useState<RepairRow[]>([]);
  const [resolutionComment, setResolutionComment] = useState("");
  const [returnError, setReturnError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [repairTarget, setRepairTarget] = useState<{
    token: string;
    label: string;
  } | null>(null);

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
      const next = (await res.json()) as RepairRow[];
      setRows(next);
      setSelectedIds((prev) => {
        const ids = new Set(next.map((r) => r.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
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

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(""), 4000);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  useEffect(() => {
    if (!pendingHighlightUnitId || loading) return;
    const row = rows.find((r) => r.unit.id === pendingHighlightUnitId);
    if (!row) {
      setPendingHighlightUnitId("");
      setError("Единица в ремонте, но в списке её нет — обновите страницу");
      return;
    }
    setSelectedIds((prev) => new Set(prev).add(row.id));
    setHighlightId(row.id);
    setPendingHighlightUnitId("");
    window.requestAnimationFrame(() => {
      scrollToRepairRow(row.id);
    });
  }, [pendingHighlightUnitId, loading, rows]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  function toggleAll() {
    setSelectedIds((prev) => {
      if (rows.length > 0 && rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  function openReturn(targets: RepairRow[]) {
    if (targets.length === 0) return;
    setReturnTargets(targets);
    setResolutionComment("");
    setReturnError("");
  }

  function focusRepairUnit(unitId: string) {
    const row = rows.find((r) => r.unit.id === unitId);
    if (row) {
      setSelectedIds((prev) => new Set(prev).add(row.id));
      setHighlightId(row.id);
      window.requestAnimationFrame(() => {
        scrollToRepairRow(row.id);
      });
      return;
    }
    setPendingHighlightUnitId(unitId);
    void load();
  }

  async function handleScannedToken(token: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}`, {
        credentials: "same-origin",
      });
      if (!res.ok) return "QR не найден. Это не единица оборудования.";
      const data = (await res.json()) as {
        unit: {
          id: string;
          unitNumber: number;
          inRepair: boolean;
        };
        item: { name: string; equipmentCode: number | null };
      };
      if (data.unit.inRepair) {
        setScannerOpen(false);
        focusRepairUnit(data.unit.id);
        return null;
      }
      setScannerOpen(false);
      setRepairTarget({
        token,
        label: `${data.item.name} · ${formatUnitId(data.item.equipmentCode, data.unit.unitNumber)}`,
      });
      return null;
    } catch {
      return "Не удалось проверить QR";
    }
  }

  async function resolve() {
    if (returnTargets.length === 0) return;
    const conclusion = resolutionComment.trim();
    if (!conclusion) {
      setReturnError("Напишите заключение сервиса");
      return;
    }
    setBusy(true);
    setReturnError("");
    setError("");
    try {
      for (const target of returnTargets) {
        const res = await fetch(`/api/repairs/${target.id}`, {
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
      }
      const returned = new Set(returnTargets.map((r) => r.id));
      setReturnTargets([]);
      setResolutionComment("");
      setSelectedIds((prev) => new Set([...prev].filter((id) => !returned.has(id))));
      await load();
    } catch {
      setReturnError("Не удалось вернуть из ремонта");
    } finally {
      setBusy(false);
    }
  }

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const scanButton = (
    <Button variant="outline" onClick={() => setScannerOpen(true)}>
      <QrScanIcon />
      Сканировать QR
    </Button>
  );

  function rowClass(id: string) {
    if (highlightId === id || selectedIds.has(id)) {
      return "bg-[var(--selected)]";
    }
    return "hover:bg-subtle";
  }

  return (
    <div className="w-full px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        eyebrow="Склад"
        title="Ремонт"
        subtitle="Единицы, списанные со склада. История поломки закреплена за ID единицы."
        actions={scanButton}
      />
      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      {selectedIds.size > 0 ? (
        <div className="mb-3 flex items-center justify-end gap-3">
          <span className="text-xs text-[var(--muted)]">
            Выбрано: {selectedIds.size}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => openReturn(selectedRows)}
          >
            Вернуть на склад
          </Button>
        </div>
      ) : null}

      <Card>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Сейчас ничего не в ремонте"
            description="Отсканируйте QR единицы, чтобы списать её в ремонт — она появится здесь."
            action={scanButton}
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--line)] md:hidden">
              {rows.map((r) => (
                <li
                  key={r.id}
                  data-repair-id={r.id}
                  className={`flex items-start gap-2 px-3 py-3 text-left ${rowClass(r.id)}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    aria-label={`Выбрать ${r.unit.catalogItem.name}`}
                    className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                    onChange={() => toggleRow(r.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-caption uppercase tracking-wider text-[var(--muted)]">
                      {r.unit.catalogItem.category?.path || "Оборудование"}
                    </p>
                    <Link
                      href={`/q/${r.unit.qrToken}`}
                      className="font-medium text-[var(--accent-deep)] hover:text-[var(--accent)] hover:underline"
                    >
                      {unitTitle(r)}
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      ID {unitIdLabel(r)}
                    </p>
                    <p className="mt-1.5 text-sm text-[var(--ink)]">
                      {faultTypeLabel(r.faultType)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {fmtDt(r.reportedAt)} · {reporterName(r.reportedBy)}
                    </p>
                    {r.comment ? (
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--ink)]">
                        {r.comment}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-2 text-sm text-[var(--accent-deep)] hover:underline"
                      disabled={busy}
                      onClick={() => openReturn([r])}
                    >
                      Вернуть на склад
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="data-table-shell hidden overflow-x-auto md:block">
              <table className="data-table w-full text-left text-sm">
              <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label="Выбрать все"
                      className="size-4 accent-[var(--accent)]"
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-3">Единица</th>
                  <th className="px-4 py-3">Тип поломки</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Кто указал</th>
                  <th className="px-4 py-3">Комментарий</th>
                  <th className="px-4 py-3"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    data-repair-id={r.id}
                    className={`border-t border-[var(--line)] text-left transition-colors ${rowClass(r.id)}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        aria-label={`Выбрать ${r.unit.catalogItem.name}`}
                        className="size-4 accent-[var(--accent)]"
                        onChange={() => toggleRow(r.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/q/${r.unit.qrToken}`}
                        className="font-medium text-[var(--accent-deep)] hover:text-[var(--accent)] hover:underline"
                      >
                        {unitTitle(r)}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {r.unit.catalogItem.category?.path || "Оборудование"}
                        {" · "}
                        ID {unitIdLabel(r)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{faultTypeLabel(r.faultType)}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {fmtDt(r.reportedAt)}
                    </td>
                    <td className="px-4 py-3">{reporterName(r.reportedBy)}</td>
                    <td className="px-4 py-3">
                      {r.comment ? (
                        <p className="line-clamp-2 max-w-xs" title={r.comment}>
                          {r.comment}
                        </p>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                      {r.photos.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {r.photos.map((p) => (
                            <a
                              key={p.id}
                              href={`/api/repairs/${r.id}/photos/${p.id}/file`}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded border border-[var(--line)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/repairs/${r.id}/photos/${p.id}/file`}
                                alt={p.filename}
                                className="size-9 object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-sm text-[var(--accent-deep)] hover:underline disabled:opacity-40"
                        disabled={busy}
                        onClick={() => openReturn([r])}
                      >
                        Вернуть на склад
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={returnTargets.length > 0}
        onClose={() => {
          if (!busy) setReturnTargets([]);
        }}
        title={
          returnTargets.length > 1
            ? `Вернуть ${returnTargets.length} единиц на склад`
            : "Вернуть на склад"
        }
        className="max-w-md"
      >
        <p className="mt-1 text-sm text-[var(--muted)]">
          Заключение сервиса сохранится в истории поломки
          {returnTargets.length === 1
            ? ` единицы ${unitIdLabel(returnTargets[0])}`
            : returnTargets.length > 1
              ? ` (${returnTargets.length} ед.)`
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
            disabled={busy}
          />
        </label>
        {returnError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{returnError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setReturnTargets([])}
          >
            Отмена
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void resolve()}
          >
            {busy ? "Возврат…" : "Вернуть на склад"}
          </Button>
        </div>
      </Modal>

      <EquipmentQrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onToken={handleScannedToken}
      />

      <EquipmentRepairFormModal
        open={!!repairTarget}
        unitLabel={repairTarget?.label || ""}
        token={repairTarget?.token || ""}
        onClose={() => setRepairTarget(null)}
        onSubmitted={() => {
          setRepairTarget(null);
          void load();
        }}
      />
    </div>
  );
}
