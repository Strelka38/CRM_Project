"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ZoneTab } from "@/components/QuoteZoneTabs";
import { customerWarnings, type LegalDocInput } from "@/lib/legal-docs";
import { formatMoney } from "@/lib/format";
import type { QuoteBlockInput } from "@/lib/quote-calc";
import type { ExportMeta } from "@/lib/export/quote-zones";

type Account = {
  id: string;
  label: string;
  bankName: string;
  account: string;
  corrAccount: string;
  bik: string;
  isDefault: boolean;
};

type Entity = {
  id: string;
  shortName: string;
  fullName: string;
  inn: string;
  ogrnip: string;
  legalAddress: string;
  phone: string;
  email: string;
  signatoryName: string;
  catalogOwner: string | null;
  sealPath: string | null;
  signaturePath: string | null;
  bankAccounts: Account[];
};

type ClientInfo = {
  companyName: string;
  contactName: string;
  inn: string;
  legalAddress: string;
  legalDetails: string;
  phone: string;
  email: string;
};

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  invoiceSent?: boolean;
  uploader?: { id: string; name: string } | null;
};

export type QuoteDocumentsPanelProps = {
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  eventDate: string;
  venue: string;
  clientName: string;
  clientId: string | null;
  amount: number;
  zones: ZoneTab[];
  blocks: QuoteBlockInput[];
  canEdit?: boolean;
  onInvoiceSentChange?: (sent: boolean) => void;
  exportMeta: ExportMeta;
};

function todayRu() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatWhen(iso: string) {
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

function fileUrl(quoteId: string, id: string, download = false) {
  const base = `/api/quotes/${quoteId}/attachments/${id}/file`;
  return download ? `${base}?download=1` : base;
}

function isPdf(mime: string) {
  return mime === "application/pdf";
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

async function uploadBlob(quoteId: string, blob: Blob, filename: string) {
  const file = new File([blob], filename, {
    type: blob.type || "application/pdf",
  });
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch(`/api/quotes/${quoteId}/attachments`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : "Не удалось сохранить файл",
    );
  }
  return res.json() as Promise<Attachment>;
}

export function QuoteDocumentsPanel({
  quoteId,
  proposalNumber,
  eventName,
  eventDate,
  venue,
  clientName,
  clientId,
  amount,
  zones,
  blocks,
  canEdit = true,
  onInvoiceSentChange,
  exportMeta,
}: QuoteDocumentsPanelProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contractNumber, setContractNumber] = useState(proposalNumber);
  const [contractDate, setContractDate] = useState(todayRu());
  const [paymentDue, setPaymentDue] = useState(eventDate || todayRu());
  const [sum, setSum] = useState(String(Math.round(amount)));
  const [docEventName, setDocEventName] = useState(eventName);
  const [includeContract, setIncludeContract] = useState(true);
  const [includeInvoice, setIncludeInvoice] = useState(true);
  const [includeAct, setIncludeAct] = useState(true);
  const [attachPdf, setAttachPdf] = useState(false);
  const [attachXls, setAttachXls] = useState(false);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [preview, setPreview] = useState<Attachment | null>(null);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    const res = await fetch(`/api/quotes/${quoteId}/attachments`);
    if (res.ok) {
      const data: unknown = await res.json();
      setFiles(Array.isArray(data) ? (data as Attachment[]) : []);
    }
    setFilesLoading(false);
  }, [quoteId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setContractNumber(proposalNumber);
    setSum(String(Math.round(amount)));
    setPaymentDue(eventDate || todayRu());
    setDocEventName(eventName);
    setError("");
    void (async () => {
      const res = await fetch("/api/legal-entities");
      if (res.ok) {
        const rows: Entity[] = await res.json();
        setEntities(rows);
        const first = rows[0];
        if (first) {
          setEntityId(first.id);
          const def =
            first.bankAccounts.find((a) => a.isDefault) || first.bankAccounts[0];
          setAccountId(def?.id || "");
        }
      }
      if (clientId) {
        const cr = await fetch(`/api/clients/${clientId}`);
        if (cr.ok) {
          const c = await cr.json();
          setClient({
            companyName: c.companyName || clientName,
            contactName: c.contactName || "",
            inn: c.inn || "",
            legalAddress: c.legalAddress || "",
            legalDetails: c.legalDetails || "",
            phone: c.phone || "",
            email: c.email || "",
          });
        }
      } else {
        setClient({
          companyName: clientName,
          contactName: "",
          inn: "",
          legalAddress: "",
          legalDetails: "",
          phone: "",
          email: "",
        });
      }
    })();
  }, [proposalNumber, amount, eventDate, eventName, clientId, clientName]);

  const entity = entities.find((e) => e.id === entityId) || null;
  const accounts = entity?.bankAccounts || [];
  const account =
    accounts.find((a) => a.id === accountId) || accounts[0] || null;

  useEffect(() => {
    if (!entity) return;
    const def =
      entity.bankAccounts.find((a) => a.isDefault) || entity.bankAccounts[0];
    if (def && !entity.bankAccounts.some((a) => a.id === accountId)) {
      setAccountId(def.id);
    }
  }, [entity, accountId]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!clientId) w.push("Привяжите клиента в карточке КП");
    if (client) w.push(...customerWarnings(client));
    if (!entity) w.push("Нет юрлиц — добавьте карточку в База Данных → Юрлица");
    if (entity && !account) w.push("У исполнителя нет расчётного счёта");
    if (!includeContract && !includeInvoice && !includeAct) {
      w.push("Выберите хотя бы один документ");
    }
    return w;
  }, [clientId, client, entity, account, includeContract, includeInvoice, includeAct]);

  async function run() {
    if (!entity || !account || !client) return;
    if (!includeContract && !includeInvoice && !includeAct) return;
    setBusy(true);
    setError("");
    const input: LegalDocInput = {
      city: "г. Иркутск",
      contractNumber: contractNumber.trim() || proposalNumber,
      contractDate: contractDate.trim() || todayRu(),
      paymentDue: paymentDue.trim(),
      amount: Number(sum.replace(/\s/g, "").replace(",", ".")) || 0,
      eventName: docEventName.trim() || eventName,
      eventDate,
      venue,
      executor: {
        shortName: entity.shortName,
        fullName: entity.fullName,
        inn: entity.inn,
        ogrnip: entity.ogrnip,
        legalAddress: entity.legalAddress,
        phone: entity.phone,
        email: entity.email,
        signatoryName: entity.signatoryName,
      },
      bank: {
        label: account.label,
        bankName: account.bankName,
        account: account.account,
        corrAccount: account.corrAccount,
        bik: account.bik,
      },
      customer: client,
    };
    try {
      const { exportLegalDocumentsPdf } = await import("@/lib/legal-docs-pdf");
      const legal = await exportLegalDocumentsPdf({
        input,
        includeContract,
        includeInvoice,
        includeAct,
        entityId: entity.id,
        hasSeal: Boolean(entity.sealPath),
        hasSignature: Boolean(entity.signaturePath),
      });
      await uploadBlob(quoteId, legal.blob, legal.filename);

      if (attachPdf || attachXls) {
        const mod = await import("@/lib/export/quote-zones");
        const filters = {
          includeSummary: true,
          allTabsOneSheet: true,
          showEquipmentPrice: true,
          showConsumablePrice: false,
          showServicePrice: true,
          zoneIds: zones.map((z) => z.id),
        };
        const kpMeta: ExportMeta = {
          ...exportMeta,
          clientId,
          ownerId: exportMeta.ownerId,
          managerPhone: exportMeta.managerPhone,
        };
        if (attachPdf) {
          const pdf = await mod.exportQuoteZonesPdf(
            kpMeta,
            zones,
            blocks,
            filters,
          );
          await uploadBlob(quoteId, pdf.blob, pdf.filename);
        }
        if (attachXls) {
          const xls = await mod.exportQuoteZonesExcel(
            kpMeta,
            zones,
            blocks,
            filters,
          );
          await uploadBlob(quoteId, xls.blob, xls.filename);
        }
      }
      await loadFiles();
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Не удалось сформировать документы",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(id: string) {
    if (!confirm("Удалить документ?")) return;
    const res = await fetch(
      `/api/quotes/${quoteId}/attachments?attachmentId=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError("Не удалось удалить файл");
      return;
    }
    if (preview?.id === id) setPreview(null);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function toggleInvoiceSent(a: Attachment) {
    if (!canEdit) return;
    const next = !a.invoiceSent;
    setFiles((prev) =>
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
      await loadFiles();
      setError("Не удалось отметить счёт");
      return;
    }
    onInvoiceSentChange?.(next);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-medium">Сформировать</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          PDF сохранится в архиве сметы. Можно сразу скачать и открыть.
        </p>
        <div className="mt-4 grid gap-3 text-sm">
          <label>
            <span className="text-[var(--muted)]">Исполнитель</span>
            <select
              className="field mt-1"
              value={entityId}
              disabled={!canEdit}
              onChange={(e) => setEntityId(e.target.value)}
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.shortName}
                  {e.catalogOwner
                    ? ` (${e.catalogOwner === "NE_EVENT" ? "NE" : e.catalogOwner === "SHOW_MASTER" ? "ШМ" : "ДК"})`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {accounts.length > 1 && (
            <label>
              <span className="text-[var(--muted)]">Расчётный счёт</span>
              <select
                className="field mt-1"
                value={accountId}
                disabled={!canEdit}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label || a.bankName} · {a.account}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-[var(--muted)]">№ договора</span>
              <input
                className="field mt-1"
                value={contractNumber}
                disabled={!canEdit}
                onChange={(e) => setContractNumber(e.target.value)}
              />
            </label>
            <label>
              <span className="text-[var(--muted)]">Дата</span>
              <input
                className="field mt-1"
                value={contractDate}
                disabled={!canEdit}
                onChange={(e) => setContractDate(e.target.value)}
              />
            </label>
            <label>
              <span className="text-[var(--muted)]">Сумма</span>
              <input
                className="field mt-1"
                value={sum}
                disabled={!canEdit}
                onChange={(e) => setSum(e.target.value)}
              />
            </label>
            <label>
              <span className="text-[var(--muted)]">Оплатить до</span>
              <input
                className="field mt-1"
                value={paymentDue}
                disabled={!canEdit}
                onChange={(e) => setPaymentDue(e.target.value)}
              />
            </label>
          </div>
          <label>
            <span className="text-[var(--muted)]">Название мероприятия</span>
            <input
              className="field mt-1"
              value={docEventName}
              disabled={!canEdit}
              onChange={(e) => setDocEventName(e.target.value)}
              placeholder="Как в КП"
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            Предмет: {docEventName.trim() || eventName || "—"}
            {eventDate ? `, ${eventDate}` : ""}
            {venue ? `, ${venue}` : ""} · по смете {formatMoney(amount)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Заказчик: {client?.companyName || clientName || "—"}
            {client?.inn ? ` · ИНН ${client.inn}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeContract}
                disabled={!canEdit}
                onChange={(e) => setIncludeContract(e.target.checked)}
              />
              Договор
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeInvoice}
                disabled={!canEdit}
                onChange={(e) => setIncludeInvoice(e.target.checked)}
              />
              Счёт
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeAct}
                disabled={!canEdit}
                onChange={(e) => setIncludeAct(e.target.checked)}
              />
              Акт
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={attachPdf}
                disabled={!canEdit}
                onChange={(e) => setAttachPdf(e.target.checked)}
              />
              Приложить смету PDF
            </label>
            <label className="flex items-center gap-2 col-span-2">
              <input
                type="checkbox"
                checked={attachXls}
                disabled={!canEdit}
                onChange={(e) => setAttachXls(e.target.checked)}
              />
              Приложить смету Excel
            </label>
          </div>
          {warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {canEdit && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={
                  busy ||
                  !entity ||
                  (!includeContract && !includeInvoice && !includeAct)
                }
                onClick={() => void run()}
                className="rounded-md bg-[var(--solid)] px-4 py-2 text-[var(--on-solid)] disabled:opacity-40"
              >
                {busy ? "Формирование…" : "Сформировать и сохранить"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="font-medium">Архив документов</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Ранее созданные по этой смете файлы. Галочка — какой счёт отправили
          заказчику.
        </p>
        {filesLoading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Загрузка…</p>
        ) : files.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Пока нет сохранённых документов.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {files.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2"
              >
                <label className="mt-0.5 flex w-14 shrink-0 flex-col items-center gap-1 text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={Boolean(a.invoiceSent)}
                    disabled={!canEdit}
                    title="Счёт отправлен заказчику"
                    onChange={() => void toggleInvoiceSent(a)}
                  />
                  <span className="text-caption leading-tight text-[var(--muted)]">
                    {a.invoiceSent ? "отправлен" : "счёт"}
                  </span>
                </label>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.filename}</p>
                  <p className="text-caption text-[var(--muted)]">
                    {formatWhen(a.createdAt)}
                    {a.uploader?.name ? ` · ${a.uploader.name}` : ""}
                    {` · ${formatBytes(a.size)}`}
                    {a.invoiceSent ? " · счёт отправлен" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--accent)] hover:underline"
                    onClick={() => setPreview(a)}
                  >
                    Просмотр
                  </button>
                  <a
                    href={fileUrl(quoteId, a.id, true)}
                    className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Скачать
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      className="text-xs text-[var(--danger)]"
                      onClick={() => void removeFile(a.id)}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
              <p className="truncate text-sm font-medium">{preview.filename}</p>
              <div className="flex shrink-0 items-center gap-3">
                <a
                  href={fileUrl(quoteId, preview.id, true)}
                  className="text-sm text-[var(--accent)]"
                >
                  Скачать
                </a>
                <button
                  type="button"
                  className="text-sm text-[var(--muted)]"
                  onClick={() => setPreview(null)}
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {isImage(preview.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileUrl(quoteId, preview.id)}
                  alt={preview.filename}
                  className="mx-auto max-h-[75vh] max-w-full object-contain"
                />
              ) : isPdf(preview.mimeType) ? (
                <iframe
                  title={preview.filename}
                  src={fileUrl(quoteId, preview.id)}
                  className="h-[75vh] w-full rounded border border-[var(--line)]"
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Предпросмотр этого типа файла недоступен. Скачайте его.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
