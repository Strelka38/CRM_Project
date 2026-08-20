"use client";

import { formatUnitId } from "@/lib/equipment-id";
import { downloadQrPng } from "@/lib/download-qr";

type Category = { id: string; name: string; path: string };

type DocumentRow = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  description?: string | null;
  createdAt?: string;
  fileUrl: string;
  uploader?: { id: string; name: string } | null;
};

type UnitRow = {
  id: string;
  unitNumber: number;
  qrToken: string;
  label?: string | null;
  inRepair?: boolean;
  active?: boolean;
  writeOffReason?: string | null;
  writeOffComment?: string | null;
};

export type EquipmentCardData = {
  id: string;
  name: string;
  model?: string | null;
  manufacturer?: string | null;
  stockQty: number;
  power?: number | null;
  weight?: number | null;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  comment?: string | null;
  equipmentCode?: number | null;
  photoUrl?: string | null;
  showInCatalog?: boolean;
  category?: Category | null;
};

type Props = {
  item: EquipmentCardData;
  /** Номер единицы на публичной QR-странице */
  unitNumber?: number | null;
  unitLabel?: string | null;
  unitInRepair?: boolean;
  documents: DocumentRow[];
  units?: UnitRow[];
  editable?: boolean;
  busy?: boolean;
  onUploadPhoto?: (file: File) => void | Promise<void>;
  onRemovePhoto?: () => void | Promise<void>;
  onUploadDoc?: (file: File) => void | Promise<void>;
  onDeleteDoc?: (docId: string) => void | Promise<void>;
  onSyncUnits?: () => void | Promise<void>;
  onAddUnit?: () => void | Promise<void>;
  onWriteOff?: (unitId: string) => void | Promise<void>;
  onSaveLabel?: (unitId: string, label: string) => void | Promise<void>;
  onToggleShowInCatalog?: (value: boolean) => void | Promise<void>;
  origin?: string;
};

function fmtSize(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function Spec({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--ink)]">{value}</dd>
    </div>
  );
}

export function EquipmentCard({
  item,
  unitNumber,
  unitLabel,
  unitInRepair = false,
  documents,
  units = [],
  editable = false,
  busy = false,
  onUploadPhoto,
  onRemovePhoto,
  onUploadDoc,
  onDeleteDoc,
  onSyncUnits,
  onAddUnit,
  onWriteOff,
  onSaveLabel,
  onToggleShowInCatalog,
  origin = "",
}: Props) {
  const dims = [item.width, item.height, item.depth]
    .filter((v) => v != null)
    .join(" × ");

  const titleMeta = [
    item.model || item.manufacturer || null,
    item.equipmentCode != null ? `ID: ${item.equipmentCode}` : null,
    unitNumber != null
      ? `ед. ${formatUnitId(item.equipmentCode, unitNumber)}`
      : null,
    `${item.stockQty} на складе`,
  ]
    .filter(Boolean)
    .join(" · ");

  async function copyLink(token: string) {
    const url = `${origin || (typeof window !== "undefined" ? window.location.origin : "")}/q/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          {item.category?.path || "Оборудование"}
        </p>
        <h1 className="font-display text-2xl font-semibold text-[var(--ink)] sm:text-3xl">
          {item.name}
        </h1>
        <p className="text-sm text-[var(--muted)]">{titleMeta}</p>
        {unitLabel ? (
          <p className="text-sm text-[var(--ink)]">Метка: {unitLabel}</p>
        ) : null}
        {unitInRepair ? (
          <p className="text-sm text-[var(--warning)]">Статус: в ремонте</p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="text-xs uppercase text-[var(--muted)]">Фото</h2>
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photoUrl}
            alt={item.name}
            className="max-h-72 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] object-contain"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">
            Нет фото
          </div>
        )}
        {editable && (onUploadPhoto || onRemovePhoto) ? (
          <div className="flex flex-wrap gap-2">
            {onUploadPhoto ? (
              <label className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)]">
                {busy
                  ? "Загрузка…"
                  : item.photoUrl
                    ? "Заменить фото"
                    : "Загрузить фото"}
                <input
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void onUploadPhoto(file);
                  }}
                />
              </label>
            ) : null}
            {item.photoUrl && onRemovePhoto ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
                onClick={() => void onRemovePhoto()}
              >
                Убрать фото
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase text-[var(--muted)]">Характеристики</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Spec
            label="Мощность"
            value={item.power != null ? `${item.power} Вт` : null}
          />
          <Spec
            label="Вес"
            value={item.weight != null ? `${item.weight} кг` : null}
          />
          <Spec label="Габариты" value={dims || null} />
          <Spec label="Категория" value={item.category?.path || null} />
          <Spec label="Производитель" value={item.manufacturer || null} />
          <Spec label="Модель" value={item.model || null} />
        </dl>
        {item.comment ? (
          <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">
            {item.comment}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase text-[var(--muted)]">Каталог сметы</h2>
        {editable && onToggleShowInCatalog ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={item.showInCatalog !== false}
              disabled={busy}
              onChange={(e) => void onToggleShowInCatalog(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">
                Отражать товар в каталоге
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                Если выключить, менеджер не увидит позицию в каталоге сметы.
                В комплекты и спецификации её по-прежнему можно добавлять.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-[var(--ink)]">
            {item.showInCatalog !== false
              ? "Показывается в каталоге сметы"
              : "Скрыта из каталога сметы — только комплекты и спецификации"}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs uppercase text-[var(--muted)]">Документация</h2>
          {editable && onUploadDoc ? (
            <label className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)]">
              {busy ? "Загрузка…" : "+ Файл"}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void onUploadDoc(file);
                }}
              />
            </label>
          ) : null}
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Нет файлов</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--ink)]">
                    {d.filename}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {fmtSize(d.size)}
                    {d.description ? ` · ${d.description}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-[var(--line)] px-2.5 py-1 text-sm hover:bg-[var(--panel-muted)]"
                  >
                    Скачать
                  </a>
                  {editable && onDeleteDoc ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-md px-2.5 py-1 text-sm text-[var(--danger)] disabled:opacity-50"
                      onClick={() => void onDeleteDoc(d.id)}
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editable ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs uppercase text-[var(--muted)]">
              Единицы и QR
            </h2>
            <div className="flex flex-wrap gap-2">
              {onAddUnit ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--panel-muted)]"
                  onClick={() => void onAddUnit()}
                >
                  + Единица
                </button>
              ) : null}
              {onSyncUnits ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--panel-muted)]"
                  onClick={() => void onSyncUnits()}
                >
                  Догнать до склада
                </button>
              ) : null}
            </div>
          </div>
          {units.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Единиц пока нет. Нажмите «+ Единица».
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--panel-muted)] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID единицы</th>
                    <th className="px-3 py-2 font-medium">№</th>
                    <th className="px-3 py-2 font-medium">Метка</th>
                    <th className="px-3 py-2 font-medium">QR-ссылка</th>
                    <th className="px-3 py-2 font-medium" />
                    <th className="px-3 py-2 font-medium" />
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {units.map((u) => {
                    const href = `/q/${u.qrToken}`;
                    const unitId = formatUnitId(item.equipmentCode, u.unitNumber);
                    const writtenOff = u.active === false;
                    return (
                      <tr
                        key={u.id}
                        className={writtenOff ? "opacity-60" : undefined}
                      >
                        <td className="px-3 py-2 font-medium tabular-nums">
                          {unitId}
                          {u.inRepair ? (
                            <span className="ml-2 text-xs font-normal text-[var(--warning)]">
                              ремонт
                            </span>
                          ) : null}
                          {writtenOff ? (
                            <span className="ml-2 text-xs font-normal text-[var(--danger)]">
                              {u.writeOffReason === "LOST"
                                ? "утеряно"
                                : "повреждено"}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{u.unitNumber}</td>
                        <td className="px-3 py-2">
                          {editable && onSaveLabel && !writtenOff ? (
                            <input
                              className="field py-1 text-sm"
                              defaultValue={u.label || ""}
                              placeholder="Метка"
                              key={`${u.id}-${u.label || ""}`}
                              onBlur={(e) => {
                                const next = e.target.value.trim();
                                if (next !== (u.label || "")) {
                                  void onSaveLabel(u.id, next);
                                }
                              }}
                            />
                          ) : (
                            <span className="text-[var(--muted)]">
                              {u.label || "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {writtenOff ? (
                            <span className="text-xs text-[var(--muted)]">
                              {u.writeOffComment || "Списано"}
                            </span>
                          ) : (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--accent)] hover:underline"
                            >
                              {href}
                            </a>
                          )}
                        </td>
                        <td className="px-1 py-2">
                          {!writtenOff ? (
                            <button
                              type="button"
                              className="btn-icon inline-flex h-8 w-8 items-center justify-center"
                              title="Скачать QR-код"
                              aria-label={`Скачать QR-код ${unitId}`}
                              onClick={() => {
                                const origin =
                                  typeof window !== "undefined"
                                    ? window.location.origin
                                    : "";
                                void downloadQrPng(
                                  `${origin}${href}`,
                                  `qr-${unitId}`,
                                );
                              }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                                aria-hidden
                              >
                                <path d="M12 4v12" />
                                <path d="M7 11l5 5 5-5" />
                                <path d="M5 20h14" />
                              </svg>
                            </button>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!writtenOff ? (
                            <button
                              type="button"
                              className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs hover:bg-[var(--panel-muted)]"
                              onClick={() => void copyLink(u.qrToken)}
                            >
                              Копировать
                            </button>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editable && onWriteOff && !writtenOff ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="text-xs text-[var(--danger)] disabled:opacity-50"
                              onClick={() => void onWriteOff(u.id)}
                            >
                              Списать
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
