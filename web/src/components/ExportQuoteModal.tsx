"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import type { ZoneTab } from "@/components/QuoteZoneTabs";
import type { QuoteBlockInput } from "@/lib/quote-calc";
import { resolveEstimateDisclaimer } from "@/lib/commercial-terms";
import type { ExportFilters, ExportMeta } from "@/lib/export/quote-zones";
import {
  LAST_EXPORT_TEMPLATE_KEY,
  NEW_TEMPLATE_VALUE,
  STANDARD_TEMPLATE_ID,
  baseTemplateNote,
  parseExportTemplates,
  readLastExportTemplateId,
  resolveExportTemplateId,
  templateNameError,
  writeLastExportTemplateId,
  type ExportTemplate,
  type ExportTemplateSettings,
} from "@/lib/export/export-templates";
import {
  EXPORT_OPTION_ROWS,
  STANDARD_PRINT_OPTIONS,
  type ExportOptionRow,
  type QuotePrintOptions,
} from "@/lib/export/print-options";
import { quoteSheetShowsIdentity } from "@/lib/quote-sheet-chrome";
import { cn } from "@/lib/cn";

async function resolveExportMeta(meta: ExportMeta): Promise<ExportMeta> {
  let next = meta;
  const jobs: Array<Promise<void>> = [];
  if (!next.managerPhone?.trim() && next.ownerId) {
    jobs.push(
      fetch(`/api/users/${next.ownerId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data: unknown = await res.json();
          if (!data || typeof data !== "object") return;
          const phone =
            "phone" in data && typeof data.phone === "string" ? data.phone : "";
          const name =
            "name" in data && typeof data.name === "string" && data.name.trim()
              ? data.name
              : next.managerName;
          next = { ...next, managerPhone: phone, managerName: name };
        })
        .catch(() => undefined),
    );
  }
  if (next.clientId && !next.clientPhone?.trim()) {
    jobs.push(
      fetch(`/api/clients/${next.clientId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data: unknown = await res.json();
          if (!data || typeof data !== "object") return;
          const phone =
            "phone" in data && typeof data.phone === "string" ? data.phone.trim() : "";
          if (phone) next = { ...next, clientPhone: phone };
        })
        .catch(() => undefined),
    );
  }
  if (next.venueId && !next.address?.trim()) {
    jobs.push(
      fetch(`/api/venues/${next.venueId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data: unknown = await res.json();
          if (!data || typeof data !== "object") return;
          const address =
            "address" in data && typeof data.address === "string"
              ? data.address.trim()
              : "";
          if (address) next = { ...next, address };
        })
        .catch(() => undefined),
    );
  }
  await Promise.all(jobs);
  return next;
}

type FilterKey =
  | "includeSummary"
  | "allTabsOneSheet"
  | "showEquipmentPrice"
  | "showConsumablePrice"
  | "showServicePrice";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLDivElement | null>;
  quoteId: string;
  lifecycle: string;
  meta: ExportMeta;
  zones: ZoneTab[];
  blocks: QuoteBlockInput[];
};

function standardFilters() {
  return {
    includeSummary: false,
    allTabsOneSheet: true,
    showEquipmentPrice: true,
    showConsumablePrice: true,
    showServicePrice: true,
    print: { ...STANDARD_PRINT_OPTIONS },
  };
}

export function ExportQuoteModal({
  open,
  onClose,
  anchorRef,
  quoteId,
  lifecycle,
  meta,
  zones,
  blocks,
}: Props) {
  const initial = standardFilters();
  const [templateId, setTemplateId] = useState(STANDARD_TEMPLATE_ID);
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(initial.includeSummary);
  const [allTabsOneSheet, setAllTabsOneSheet] = useState(initial.allTabsOneSheet);
  const [showEquipmentPrice, setShowEquipmentPrice] = useState(initial.showEquipmentPrice);
  const [showConsumablePrice, setShowConsumablePrice] = useState(
    initial.showConsumablePrice,
  );
  const [showServicePrice, setShowServicePrice] = useState(initial.showServicePrice);
  const [print, setPrint] = useState<QuotePrintOptions>(initial.print);
  const [zoneOn, setZoneOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(zones.map((z) => [z.id, true])),
  );
  const [busy, setBusy] = useState<"pdf" | "xls" | "preview" | "link" | null>(null);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closed = lifecycle === "COMPLETED";

  useEffect(() => {
    setZoneOn((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const zone of zones) {
        if (!(zone.id in next)) {
          next[zone.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [zones]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/export-templates")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled || !data || typeof data !== "object") return;
        const list =
          "templates" in data ? parseExportTemplates(data.templates) : [];
        setTemplates(list);
        const stored = readLastExportTemplateId();
        const serverDefault =
          "defaultTemplateId" in data && typeof data.defaultTemplateId === "string"
            ? data.defaultTemplateId
            : stored;
        const preferred =
          typeof window !== "undefined" &&
          window.localStorage.getItem(LAST_EXPORT_TEMPLATE_KEY)
            ? stored
            : serverDefault;
        const next = resolveExportTemplateId(preferred, list);
        setTemplateId(next);
        setCreating(false);
        if (next === STANDARD_TEMPLATE_ID) {
          const std = standardFilters();
          setIncludeSummary(std.includeSummary);
          setAllTabsOneSheet(std.allTabsOneSheet);
          setShowEquipmentPrice(std.showEquipmentPrice);
          setShowConsumablePrice(std.showConsumablePrice);
          setShowServicePrice(std.showServicePrice);
          setPrint(std.print);
        } else {
          const saved = list.find((item) => item.id === next);
          if (saved) {
            setIncludeSummary(saved.settings.includeSummary);
            setAllTabsOneSheet(saved.settings.allTabsOneSheet);
            setShowEquipmentPrice(saved.settings.showEquipmentPrice);
            setShowConsumablePrice(saved.settings.showConsumablePrice);
            setShowServicePrice(saved.settings.showServicePrice);
            setPrint({ ...saved.settings.print });
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/quotes/${quoteId}/share`);
      if (!res.ok || cancelled) return;
      const data: unknown = await res.json();
      const path =
        data &&
        typeof data === "object" &&
        "path" in data &&
        typeof data.path === "string"
          ? data.path
          : null;
      if (!cancelled) setSharePath(path);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, quoteId]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (anchorRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  const selectedCount = zones.filter((z) => zoneOn[z.id] !== false).length;
  const summaryAvailable = quoteSheetShowsIdentity(selectedCount);

  const filters: ExportFilters = useMemo(
    () => ({
      includeSummary: includeSummary && summaryAvailable,
      allTabsOneSheet,
      showEquipmentPrice,
      showConsumablePrice,
      showServicePrice,
      zoneIds: zones.filter((z) => zoneOn[z.id] !== false).map((z) => z.id),
      print,
    }),
    [
      includeSummary,
      allTabsOneSheet,
      showEquipmentPrice,
      showConsumablePrice,
      showServicePrice,
      zoneOn,
      zones,
      summaryAvailable,
      print,
    ],
  );

  const optionRows = useMemo(() => {
    const out: ExportOptionRow[] = [];
    for (const row of EXPORT_OPTION_ROWS) {
      if (row.kind === "filter" && row.key === "includeSummary" && !summaryAvailable) {
        continue;
      }
      if (row.kind === "gap" && (out.length === 0 || out[out.length - 1]?.kind === "gap")) {
        continue;
      }
      out.push(row);
    }
    while (out[out.length - 1]?.kind === "gap") out.pop();
    return out;
  }, [summaryAvailable]);

  if (!open) return null;

  function applyStandard() {
    const next = standardFilters();
    setIncludeSummary(next.includeSummary);
    setAllTabsOneSheet(next.allTabsOneSheet);
    setShowEquipmentPrice(next.showEquipmentPrice);
    setShowConsumablePrice(next.showConsumablePrice);
    setShowServicePrice(next.showServicePrice);
    setPrint(next.print);
    setZoneOn(Object.fromEntries(zones.map((z) => [z.id, true])));
  }

  function applySettings(settings: ExportTemplateSettings) {
    setIncludeSummary(settings.includeSummary);
    setAllTabsOneSheet(settings.allTabsOneSheet);
    setShowEquipmentPrice(settings.showEquipmentPrice);
    setShowConsumablePrice(settings.showConsumablePrice);
    setShowServicePrice(settings.showServicePrice);
    setPrint({ ...settings.print });
  }

  function startCreate() {
    setCreating(true);
    setDraftName("");
    setNameError("");
  }

  function currentSettings(): ExportTemplateSettings {
    return {
      includeSummary,
      allTabsOneSheet,
      showEquipmentPrice,
      showConsumablePrice,
      showServicePrice,
      print,
    };
  }

  async function saveTemplate() {
    const error = templateNameError(draftName, templates);
    if (error) {
      setNameError(error);
      return;
    }
    setSavingTemplate(true);
    setNameError("");
    const res = await fetch("/api/export-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draftName.trim(), settings: currentSettings() }),
    });
    const data: unknown = await res.json().catch(() => null);
    setSavingTemplate(false);
    if (!res.ok || !data || typeof data !== "object") {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "Не удалось сохранить";
      setNameError(message);
      return;
    }
    const list = "templates" in data ? parseExportTemplates(data.templates) : templates;
    setTemplates(list);
    const id =
      "template" in data &&
      data.template &&
      typeof data.template === "object" &&
      "id" in data.template &&
      typeof data.template.id === "string"
        ? data.template.id
        : "";
    if (id) {
      setTemplateId(id);
      writeLastExportTemplateId(id);
    }
    setCreating(false);
    setDraftName("");
  }

  function filterValue(key: FilterKey) {
    if (key === "includeSummary") return includeSummary;
    if (key === "allTabsOneSheet") return allTabsOneSheet;
    if (key === "showEquipmentPrice") return showEquipmentPrice;
    if (key === "showConsumablePrice") return showConsumablePrice;
    return showServicePrice;
  }

  function setFilter(key: FilterKey, value: boolean) {
    if (key === "includeSummary") setIncludeSummary(value);
    else if (key === "allTabsOneSheet") setAllTabsOneSheet(value);
    else if (key === "showEquipmentPrice") setShowEquipmentPrice(value);
    else if (key === "showConsumablePrice") setShowConsumablePrice(value);
    else setShowServicePrice(value);
  }

  async function run(kind: "pdf" | "xls" | "preview") {
    if (filters.zoneIds.length === 0) {
      alert("Выберите хотя бы одну зону");
      return;
    }
    setBusy(kind);
    try {
      const mod = await import("@/lib/export/quote-zones");
      const resolved = await resolveExportMeta(meta);
      const selectedNote =
        templateId === STANDARD_TEMPLATE_ID
          ? baseTemplateNote(templates)
          : templates.find((item) => item.id === templateId)?.note;
      const printed = {
        ...resolved,
        estimateDisclaimer: resolveEstimateDisclaimer(
          meta.estimateDisclaimer,
          selectedNote,
        ),
      };
      if (kind === "preview") {
        const html = await mod.buildExportPreviewHtml(
          printed,
          zones,
          blocks,
          filters,
        );
        const url = URL.createObjectURL(
          new Blob([html], { type: "text/html;charset=utf-8" }),
        );
        const w = window.open(url, "_blank");
        if (!w) URL.revokeObjectURL(url);
      } else if (kind === "pdf") {
        await mod.exportQuoteZonesPdf(printed, zones, blocks, filters);
      } else {
        await mod.exportQuoteZonesExcel(printed, zones, blocks, filters);
      }
    } finally {
      setBusy(null);
    }
  }

  async function publishLink() {
    if (closed) return;
    if (filters.zoneIds.length === 0) {
      alert("Выберите хотя бы одну зону");
      return;
    }
    setBusy("link");
    setCopied(false);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Не удалось создать ссылку";
        alert(message);
        return;
      }
      const path =
        data &&
        typeof data === "object" &&
        "path" in data &&
        typeof data.path === "string"
          ? data.path
          : null;
      setSharePath(path);
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!sharePath) return;
    const url = `${window.location.origin}${sharePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      alert(url);
    }
  }

  async function revokeLink() {
    setBusy("link");
    setCopied(false);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/share`, { method: "DELETE" });
      if (res.ok) setSharePath(null);
    } finally {
      setBusy(null);
    }
  }

  const shareUrl = sharePath ? `${typeof window === "undefined" ? "" : window.location.origin}${sharePath}` : "";

  return (
    <div
      role="dialog"
      aria-label="Экспорт сметы"
      className="absolute right-0 top-full z-40 mt-1 flex w-[min(24rem,calc(100vw-1.25rem))] max-h-[min(32rem,calc(100dvh-5.5rem))] flex-col rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-lg"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <p className="text-sm font-medium">Коммерческое предложение</p>
        <button
          type="button"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen((value) => !value)}
          className={cn(
            "text-sm",
            optionsOpen
              ? "font-medium text-[var(--accent-deep)]"
              : "text-[var(--accent)] hover:text-[var(--accent-deep)]",
          )}
        >
          Опции
        </button>
      </div>

      <label className="flex items-center gap-2 px-3 pt-2 pb-2 text-sm">
        <span className="shrink-0 text-[var(--muted)]">Шаблон</span>
        <span className="relative min-w-0 flex-1">
          <select
            className="h-8 w-full appearance-none rounded-md border border-[var(--line)] bg-[var(--panel)] pl-2.5 pr-8 text-sm leading-8 text-[var(--ink)] outline-none focus-visible:border-[var(--accent)]"
            value={creating ? NEW_TEMPLATE_VALUE : templateId}
            aria-label="Шаблон"
            onChange={(event) => {
              const next = event.target.value;
              if (next === NEW_TEMPLATE_VALUE) {
                startCreate();
                return;
              }
              setCreating(false);
              setNameError("");
              setTemplateId(next);
              writeLastExportTemplateId(next);
              if (next === STANDARD_TEMPLATE_ID) applyStandard();
              else {
                const saved = templates.find((item) => item.id === next);
                if (saved) applySettings(saved.settings);
              }
            }}
          >
            <option value={STANDARD_TEMPLATE_ID}>Стандартный шаблон</option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value={NEW_TEMPLATE_VALUE}>Создать новый</option>
          </select>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]"
          >
            <path
              d="M4 6.5 8 10.5 12 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </label>
      {creating ? (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              aria-label="Название шаблона"
              placeholder="Название шаблона"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveTemplate();
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 text-sm leading-8 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={savingTemplate}
              onClick={() => void saveTemplate()}
              className="shrink-0 text-sm text-[var(--accent)] hover:text-[var(--accent-deep)] disabled:opacity-40"
            >
              {savingTemplate ? "…" : "Сохранить"}
            </button>
          </div>
          {nameError ? (
            <p className="mt-1 text-xs text-[var(--danger)]">{nameError}</p>
          ) : null}
        </div>
      ) : (
        <div className="h-1" />
      )}

      {optionsOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--line)] px-3 py-2 text-sm">
          {optionRows.map((row, index) => {
            if (row.kind === "gap") {
              return <div key={`gap-${index}`} className="my-1.5 h-px bg-[var(--line)]" />;
            }
            const checked =
              row.kind === "print" ? print[row.key] : filterValue(row.key);
            return (
              <label key={`${row.kind}-${row.key}`} className="flex items-start gap-2 py-1">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  onChange={(event) => {
                    const value = event.target.checked;
                    if (row.kind === "print") {
                      setPrint((prev) => ({ ...prev, [row.key]: value }));
                    } else {
                      setFilter(row.key, value);
                    }
                  }}
                />
                <span className={row.kind === "print" && row.caps ? "text-[11px] uppercase tracking-wide" : undefined}>
                  {row.label}
                </span>
              </label>
            );
          })}
          {zones.length > 0 ? (
            <>
              <div className="my-1.5 h-px bg-[var(--line)]" />
              <p className="py-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">
                Зоны
              </p>
              {zones.map((zone) => (
                <label key={zone.id} className="flex items-start gap-2 py-1">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={zoneOn[zone.id] !== false}
                    onChange={(event) =>
                      setZoneOn((prev) => ({ ...prev, [zone.id]: event.target.checked }))
                    }
                  />
                  <span>{zone.name}</span>
                </label>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--line)] px-3 py-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("pdf")}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy === "pdf" ? "PDF…" : "Скачать (pdf)"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("xls")}
          className="rounded-md bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-40"
        >
          {busy === "xls" ? "Excel…" : "Скачать (xls)"}
        </button>
        <button
          type="button"
          aria-label="Сохранить шаблон"
          title="Сохранить шаблон"
          disabled={savingTemplate}
          onClick={startCreate}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path
              d="M6 3.75h9.2L19.25 7.8V20.25H4.75V3.75H6Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8.25 3.75v4.5h6.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8.25 20.25v-6.25h7.5v6.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("preview")}
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-40"
        >
          Предпросмотр
        </button>
        <button
          type="button"
          disabled={busy !== null || closed}
          title={closed ? "Мероприятие завершено" : undefined}
          onClick={() => void publishLink()}
          className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-40"
        >
          {busy === "link"
            ? "Ссылка…"
            : sharePath
              ? "Обновить ссылку"
              : "Ссылка для клиента"}
        </button>
      </div>
      {sharePath ? (
        <div className="shrink-0 space-y-2 border-t border-[var(--line)] px-3 py-3">
          <p className="text-xs text-[var(--muted)]">
            Клиент видит актуальную смету. Когда статус станет «Завершено», ссылка удалится.
          </p>
          <input
            readOnly
            value={shareUrl}
            aria-label="Ссылка для клиента"
            className="field h-8 w-full min-w-0 px-2 text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void copyLink()}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void revokeLink()}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Удалить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
