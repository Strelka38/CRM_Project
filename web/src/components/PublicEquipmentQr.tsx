"use client";

import { useEffect, useState } from "react";
import { EquipmentCard, type EquipmentCardData } from "./EquipmentCard";
import { EquipmentRepairFormModal } from "./EquipmentRepairFormModal";
import { formatUnitId } from "@/lib/equipment-id";
import { faultTypeLabel } from "@/lib/equipment-repairs";

type RepairRecord = {
  id: string;
  status: "OPEN" | "CLOSED";
  faultType: string;
  comment: string;
  resolutionComment?: string;
  reportedAt: string;
  resolvedAt: string | null;
  reportedBy: { id: string; name: string } | null;
  photos: { id: string; filename: string; fileUrl: string }[];
};

type Payload = {
  viewer: { loggedIn: boolean; canSendToRepair: boolean };
  unit: {
    id: string;
    unitNumber: number;
    label: string | null;
    qrToken: string;
    inRepair: boolean;
  };
  item: EquipmentCardData & {
    photoUrl: string | null;
  };
  documents: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    description?: string | null;
    fileUrl: string;
  }[];
  openRepair: RepairRecord | null;
  repairs: RepairRecord[];
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

export function PublicEquipmentQr({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [repairOpen, setRepairOpen] = useState(false);

  async function load() {
    const res = await fetch(`/api/q/${encodeURIComponent(token)}`);
    if (!res.ok) {
      setError("Карточка не найдена или ссылка устарела");
      setData(null);
      return;
    }
    setData((await res.json()) as Payload);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}`);
      if (!res.ok) {
        if (!cancelled) {
          setError("Карточка не найдена или ссылка устарела");
          setData(null);
        }
        return;
      }
      const json = (await res.json()) as Payload;
      if (!cancelled) setData(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-[var(--danger)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  const unitId = formatUnitId(data.item.equipmentCode, data.unit.unitNumber);
  const loggedIn = data.viewer.loggedIn;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {data.unit.inRepair ? (
        <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm">
          <p className="font-medium text-[var(--ink)]">В ремонте</p>
          {loggedIn && data.openRepair ? (
            <p className="mt-1 text-[var(--muted)]">
              {faultTypeLabel(data.openRepair.faultType)}
              {" · "}
              {fmtDt(data.openRepair.reportedAt)}
              {data.openRepair.comment ? ` · ${data.openRepair.comment}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-[var(--muted)]">
              Эта единица временно недоступна.
            </p>
          )}
        </div>
      ) : null}

      <EquipmentCard
        item={{
          ...data.item,
          photoUrl: data.item.photoUrl,
        }}
        unitNumber={data.unit.unitNumber}
        unitLabel={data.unit.label}
        unitInRepair={data.unit.inRepair}
        documents={data.documents}
        editable={false}
      />

      {data.viewer.canSendToRepair ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm text-[var(--muted)]">
            Если единица неисправна, спишите её в ремонт — она пропадёт из
            доступного склада и не будет резервироваться.
          </p>
          <button
            type="button"
            className="mt-3 rounded-md border border-[var(--danger)]/40 px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10"
            onClick={() => setRepairOpen(true)}
          >
            Списать в ремонт
          </button>
        </div>
      ) : null}

      {loggedIn && data.repairs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs uppercase text-[var(--muted)]">
            История поломок · {unitId}
          </h2>
          <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {data.repairs.map((r) => (
              <li key={r.id} className="space-y-2 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-[var(--ink)]">
                    {faultTypeLabel(r.faultType)}
                    {r.status === "OPEN" ? (
                      <span className="ml-2 text-xs font-normal text-[var(--warning)]">
                        открыта
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        закрыта
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {fmtDt(r.reportedAt)}
                    {r.reportedBy ? ` · ${r.reportedBy.name}` : ""}
                  </p>
                </div>
                {r.comment ? (
                  <p className="whitespace-pre-wrap text-[var(--ink)]">
                    {r.comment}
                  </p>
                ) : null}
                {r.resolutionComment ? (
                  <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">
                    <span className="text-xs uppercase text-[var(--muted)]">
                      Заключение сервиса
                    </span>
                    <span className="mt-0.5 block">{r.resolutionComment}</span>
                  </p>
                ) : null}
                {r.photos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {r.photos.map((p) => (
                      <a
                        key={p.id}
                        href={p.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.fileUrl}
                          alt={p.filename}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EquipmentRepairFormModal
        open={repairOpen}
        unitLabel={unitId}
        token={token}
        onClose={() => setRepairOpen(false)}
        onSubmitted={() => {
          setRepairOpen(false);
          void load();
        }}
      />
    </div>
  );
}
