"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import { usePermissions } from "@/components/PermissionProvider";
import { canSeeAssignmentPay } from "@/lib/roles";
import { Button, Modal } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { parseEventDate } from "@/lib/dates";
import {
  effectiveEventAssignments,
  formatZoneDateHint,
  rangeFromWorkingDayIndexes,
  storedWorkingDayIndexes,
  workingDayCount,
  workingDayIndexesFromRange,
} from "@/lib/quote-assignment-days";
import { mountDutyFlags } from "@/lib/quote-assignments";
import { FreelancerQuickSearch } from "@/components/FreelancerQuickSearch";

type Specialty = { id: string; name: string; shiftRate?: number };
type UserOption = {
  id: string;
  name: string;
  email: string;
  specialties: Array<{
    specialtyId: string;
    hourlyRate: number;
    shiftRate: number;
    specialty: Specialty;
  }>;
};

type QuoteZoneOption = {
  id: string;
  name: string;
  sortOrder?: number;
  active?: boolean;
  workingDayIndexes?: number[];
};

type Assignment = {
  id: string;
  userId: string | null;
  specialtyId: string;
  kind?: "EVENT" | "MOUNT";
  zoneId?: string | null;
  zone?: { id: string; name: string } | null;
  dayIndex?: number | null;
  onMount?: boolean;
  onDemount?: boolean;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride: number | null;
  hourlyRate: number;
  shiftRate: number;
  pay: number;
  isFreelancer: boolean;
  freelancerName: string;
  owners: CatalogOwnerValue[];
  user: {
    id: string;
    name: string;
    email: string;
    owners?: CatalogOwnerValue[] | null;
  };
  specialty: Specialty;
};

type ScheduleConflict = {
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  overlapDates: string[];
};

type DayOffConflict = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string;
  overlapDates: string[];
};

type CalendarBusyConflict = {
  id: string;
  kind: "RENTAL" | "TASK";
  date: string;
  title: string;
  role: "responsible" | "assignee";
  overlapDates: string[];
};

function FirmBadges({ owners }: { owners?: CatalogOwnerValue[] | null }) {
  const list = owners?.length
    ? CATALOG_OWNERS.filter((o) => owners.includes(o.value))
    : [];
  if (list.length === 0) {
    return <span className="text-caption text-[var(--muted)]">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {list.map((o) => (
        <span
          key={o.value}
          title={o.label}
          className="rounded border border-[var(--solid)] bg-[var(--solid)] px-1 py-0.5 text-caption font-medium uppercase text-[var(--on-solid)]"
        >
          {o.short}
        </span>
      ))}
    </span>
  );
}

function conflictLabel(c: ScheduleConflict) {
  const name = c.eventName.trim()
    ? `«${c.eventName.trim()}»`
    : `КП №${c.proposalNumber}`;
  const dates =
    c.overlapDates.length <= 3
      ? c.overlapDates.join(", ")
      : `${c.overlapDates[0]} — ${c.overlapDates[c.overlapDates.length - 1]} (${c.overlapDates.length} дн.)`;
  return `${dates}: №${c.proposalNumber} ${name}`;
}

function dayOffLabel(d: DayOffConflict) {
  const time =
    d.startTime && d.endTime ? ` · ${d.startTime}–${d.endTime}` : "";
  return `${d.date}${time}${d.note ? ` · ${d.note}` : ""}`;
}

function calendarBusyLabel(c: CalendarBusyConflict) {
  const kindLabel = c.kind === "RENTAL" ? "Аренда" : "Задача";
  const roleLabel =
    c.kind === "RENTAL" ? "ответственный за выдачу" : "назначен";
  return `${c.date}: ${kindLabel} «${c.title}» (${roleLabel})`;
}

function AssignmentFreelancerName({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (next: string) => void;
}) {
  const [text, setText] = useState(name);

  useEffect(() => {
    setText(name);
  }, [name]);

  return (
    <FreelancerQuickSearch
      value={text}
      onChange={setText}
      onPick={(f) => {
        setText(f.name);
        if (f.name.trim() !== name) onCommit(f.name);
      }}
      onBlur={() => {
        if (text.trim() !== name) onCommit(text);
      }}
      placeholder="ФИО фрилансера"
      inputClassName="field max-w-[200px]"
    />
  );
}

export function QuoteAssignments({
  quoteId,
  canEdit,
  compact = false,
  hidePay = false,
  kind = "EVENT",
  recommendedQty,
  zones,
  durationDays,
  eventDate,
  onZoneWorkingDaysChange,
  onChanged,
}: {
  quoteId: string;
  canEdit: boolean;
  compact?: boolean;
  /** Hide rates, ФОТ, overrides (for brigadier). Also forced by role. */
  hidePay?: boolean;
  kind?: "EVENT" | "MOUNT";
  recommendedQty?: number;
  zones?: QuoteZoneOption[];
  /** Длительность мероприятия (для вкладок дней у специалистов). */
  durationDays?: number;
  eventDate?: string;
  onZoneWorkingDaysChange?: (zoneId: string, workingDayIndexes: number[]) => void;
  onChanged?: () => void;
}) {
  const { data: session } = useSession();
  const { overrides } = usePermissions();
  const noPay =
    hidePay || !canSeeAssignmentPay(session?.user?.role, overrides);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [zoneList, setZoneList] = useState<QuoteZoneOption[]>(zones ?? []);
  const [eventDateText, setEventDateText] = useState(eventDate ?? "");
  const [layoutMode, setLayoutMode] = useState<"days" | "zones">("days");
  const layoutInitRef = useRef(false);
  const [zoneTab, setZoneTab] = useState("");
  const [mode, setMode] = useState<"staff" | "freelancer">("staff");
  const [userId, setUserId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerSpecialtyId, setFreelancerSpecialtyId] = useState("");
  const [freelancerOwner, setFreelancerOwner] = useState<CatalogOwnerValue | "">(
    "",
  );
  const [freelancerRate, setFreelancerRate] = useState("");
  const [payMode, setPayMode] = useState<"SHIFT" | "HOURLY">("SHIFT");
  const [hours, setHours] = useState(8);
  const [rateOverride, setRateOverride] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingBusy, setCheckingBusy] = useState(false);
  const eventDays = kind === "EVENT" ? workingDayCount(durationDays) : 1;
  const activeZones = zoneList.filter((z) => z.active !== false);
  const showLayoutToggle =
    kind === "EVENT" && (eventDays >= 2 || activeZones.length >= 2);
  const showDayTabs =
    kind === "EVENT" && eventDays >= 2 && layoutMode !== "zones";
  const showZoneTabs = kind === "EVENT" && layoutMode === "zones";
  const [dayTab, setDayTab] = useState(1);
  const [conflictWarn, setConflictWarn] = useState<{
    userName: string;
    conflicts: ScheduleConflict[];
    dayOffs: DayOffConflict[];
    calendarBusy: CalendarBusyConflict[];
  } | null>(null);
  const [pendingReplace, setPendingReplace] = useState<{
    assignmentId: string;
    userId: string;
  } | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  function notifyChanged() {
    onChangedRef.current?.();
  }

  const load = useCallback(async () => {
    const [aRes, uRes, sRes, qRes] = await Promise.all([
      fetch(`/api/quotes/${quoteId}/assignments`),
      canEdit ? fetch("/api/users") : Promise.resolve(null),
      canEdit ? fetch("/api/specialties") : Promise.resolve(null),
      zones?.length
        ? Promise.resolve(null)
        : fetch(`/api/quotes/${quoteId}`),
    ]);
    if (aRes.ok) {
      setAssignments(await aRes.json());
    }
    if (uRes?.ok) {
      const list = await uRes.json();
      setUsers(
        list.filter(
          (u: UserOption & { role: string; active: boolean }) => u.active,
        ),
      );
    }
    if (sRes?.ok) {
      const list = (await sRes.json()) as Specialty[];
      setAllSpecialties(list);
      if (list.length > 0) {
        setFreelancerSpecialtyId((prev) => prev || list[0].id);
      }
    }
    if (qRes?.ok) {
      const data = (await qRes.json()) as {
        zones?: QuoteZoneOption[];
        date?: string;
      };
      if (Array.isArray(data.zones)) setZoneList(data.zones);
      if (typeof data.date === "string") setEventDateText(data.date);
    } else if (zones) {
      setZoneList(zones);
    }
    setLoading(false);
  }, [quoteId, canEdit, zones?.length]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (zones) setZoneList(zones);
  }, [zones]);

  useEffect(() => {
    if (eventDate) setEventDateText(eventDate);
  }, [eventDate]);

  useEffect(() => {
    if (layoutInitRef.current) return;
    if (zoneList.length === 0) return;
    layoutInitRef.current = true;
    if (zoneList.some((z) => (z.workingDayIndexes?.length ?? 0) > 0)) {
      setLayoutMode("zones");
    }
  }, [zoneList]);

  useEffect(() => {
    if (!showZoneTabs) return;
    const list = zoneList.filter((z) => z.active !== false);
    if (zoneTab && (list.some((z) => z.id === zoneTab) || zoneList.some((z) => z.id === zoneTab))) {
      return;
    }
    setZoneTab(list[0]?.id || zoneList[0]?.id || "");
  }, [showZoneTabs, zoneTab, zoneList]);

  useEffect(() => {
    if (dayTab > eventDays) setDayTab(1);
  }, [eventDays, dayTab]);

  const selectedUser = users.find((u) => u.id === userId);
  const userSpecialties = selectedUser?.specialties || [];
  function staffForSpec(specId: string) {
    if (kind === "MOUNT") return users;
    if (!specId) return [];
    return users.filter((u) =>
      u.specialties?.some((s) => s.specialtyId === specId),
    );
  }
  function staffOptionsForRow(a: Assignment): UserOption[] {
    const list = staffForSpec(a.specialtyId);
    if (a.userId && a.user?.id && !list.some((u) => u.id === a.userId)) {
      return [
        {
          id: a.user.id,
          name: a.user.name,
          email: a.user.email,
          specialties: [],
        },
        ...list,
      ];
    }
    return list;
  }
  const staffOptions = staffForSpec(specialtyId);

  useEffect(() => {
    if (kind === "MOUNT" || !userId || !specialtyId) return;
    if (
      !userSpecialties.some((s) => s.specialtyId === specialtyId)
    ) {
      setUserId("");
    }
  }, [kind, userId, specialtyId, userSpecialties]);

  const selectedSpec = userSpecialties.find(
    (s) => s.specialtyId === specialtyId,
  );

  async function createStaffAssignment() {
    const res = await fetch(`/api/quotes/${quoteId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isFreelancer: false,
        ...(userId ? { userId } : {}),
        ...(kind === "MOUNT" ? {} : { specialtyId }),
        kind,
        ...(showDayTabs ? { dayIndex: dayTab } : {}),
        ...(showZoneTabs && zoneTab ? { zoneId: zoneTab } : {}),
        payMode: noPay || kind === "MOUNT" ? "SHIFT" : payMode,
        hours:
          noPay || kind === "MOUNT" || payMode !== "HOURLY" ? null : hours,
        rateOverride: noPay
          ? null
          : rateOverride === ""
            ? null
            : Number(rateOverride),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось назначить");
      return false;
    }
    setRateOverride("");
    setConflictWarn(null);
    void load();
    notifyChanged();
    return true;
  }

  async function addStaff() {
    setError("");
    if (kind !== "MOUNT" && !specialtyId) {
      setError("Сначала выберите должность");
      return;
    }
    if (!userId) {
      await createStaffAssignment();
      return;
    }

    setCheckingBusy(true);
    try {
      const checkRes = await fetch(
        `/api/quotes/${quoteId}/assignments/conflicts?userId=${encodeURIComponent(userId)}`,
      );
      if (checkRes.ok) {
        const data = (await checkRes.json()) as {
          conflicts?: ScheduleConflict[];
          dayOffs?: DayOffConflict[];
          calendarBusy?: CalendarBusyConflict[];
        };
        const conflicts = data.conflicts || [];
        const dayOffs = data.dayOffs || [];
        const calendarBusy = data.calendarBusy || [];
        if (
          conflicts.length > 0 ||
          dayOffs.length > 0 ||
          calendarBusy.length > 0
        ) {
          setPendingReplace(null);
          setConflictWarn({
            userName: selectedUser?.name || "Сотрудник",
            conflicts,
            dayOffs,
            calendarBusy,
          });
          return;
        }
      }
      await createStaffAssignment();
    } finally {
      setCheckingBusy(false);
    }
  }

  async function addFreelancer() {
    setError("");
    if (kind !== "MOUNT" && !freelancerSpecialtyId) {
      setError("Выберите должность");
      return;
    }
    const res = await fetch(`/api/quotes/${quoteId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isFreelancer: true,
        ...(kind === "MOUNT" ? {} : { specialtyId: freelancerSpecialtyId }),
        kind,
        ...(showDayTabs ? { dayIndex: dayTab } : {}),
        ...(showZoneTabs && zoneTab ? { zoneId: zoneTab } : {}),
        freelancerName: freelancerName.trim(),
        owners: freelancerOwner ? [freelancerOwner] : [],
        rateOverride: noPay
          ? null
          : freelancerRate === ""
            ? null
            : Number(freelancerRate),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить фрилансера");
      return;
    }
    setFreelancerName("");
    setFreelancerRate("");
    void load();
    notifyChanged();
  }

  async function removeAssignment(id: string) {
    await fetch(`/api/quotes/${quoteId}/assignments/${id}`, {
      method: "DELETE",
    });
    void load();
    notifyChanged();
  }

  async function patchAssignment(
    id: string,
    body: Record<string, unknown>,
  ) {
    setError("");
    const res = await fetch(`/api/quotes/${quoteId}/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Не удалось сохранить",
      );
    }
    void load();
    notifyChanged();
  }

  function dismissConflict() {
    setConflictWarn(null);
    setPendingReplace(null);
  }

  async function changeSlotUser(
    assignmentId: string,
    nextUserId: string,
    currentUserId: string | null,
  ) {
    if (nextUserId === (currentUserId || "")) return;
    setError("");
    if (!nextUserId) {
      await patchAssignment(assignmentId, { userId: null });
      return;
    }

    setCheckingBusy(true);
    try {
      const checkRes = await fetch(
        `/api/quotes/${quoteId}/assignments/conflicts?userId=${encodeURIComponent(nextUserId)}`,
      );
      if (checkRes.ok) {
        const data = (await checkRes.json()) as {
          conflicts?: ScheduleConflict[];
          dayOffs?: DayOffConflict[];
          calendarBusy?: CalendarBusyConflict[];
        };
        const conflicts = data.conflicts || [];
        const dayOffs = data.dayOffs || [];
        const calendarBusy = data.calendarBusy || [];
        if (
          conflicts.length > 0 ||
          dayOffs.length > 0 ||
          calendarBusy.length > 0
        ) {
          setPendingReplace({ assignmentId, userId: nextUserId });
          setConflictWarn({
            userName:
              users.find((u) => u.id === nextUserId)?.name || "Сотрудник",
            conflicts,
            dayOffs,
            calendarBusy,
          });
          return;
        }
      }
      await patchAssignment(assignmentId, { userId: nextUserId });
    } finally {
      setCheckingBusy(false);
    }
  }

  const kindRows = assignments.filter((a) => (a.kind || "EVENT") === kind);
  const rows =
    kind === "MOUNT"
      ? kindRows
      : showZoneTabs
        ? kindRows.filter((a) => !zoneTab || !a.zoneId || a.zoneId === zoneTab)
        : showDayTabs
          ? effectiveEventAssignments(kindRows, dayTab, {
              eventDays,
              zones: zoneList,
            })
          : kindRows;

  async function saveZoneWorkingDays(zoneId: string, indexes: number[]) {
    const next = storedWorkingDayIndexes(indexes, eventDays);
    setZoneList((prev) =>
      prev.map((z) =>
        z.id === zoneId ? { ...z, workingDayIndexes: next } : z,
      ),
    );
    onZoneWorkingDaysChange?.(zoneId, next);
    const res = await fetch(`/api/quotes/${quoteId}/zones/${zoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDayIndexes: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : "Не удалось сохранить даты зоны",
      );
    }
  }

  const mountHideJob = kind === "MOUNT";
  const eventStartDate = parseEventDate(eventDateText);
  const selectedZone = zoneList.find((z) => z.id === zoneTab);
  const selectedZoneRange =
    eventStartDate && selectedZone
      ? rangeFromWorkingDayIndexes(
          eventStartDate,
          eventDays,
          selectedZone.workingDayIndexes ?? [],
        )
      : null;
  const total = rows.reduce((s, a) => s + a.pay, 0);
  const colCount =
    1 +
    (mountHideJob ? 0 : 1) +
    1 +
    (mountHideJob ? 0 : 1) +
    (mountHideJob ? 1 : 0) +
    (noPay ? 0 : mountHideJob ? 2 : 3) +
    (canEdit ? 1 : 0);

  function zoneLabel(a: Assignment) {
    return (
      zoneList.find((z) => z.id === a.zoneId)?.name ||
      a.zone?.name ||
      ""
    );
  }

  if (loading && assignments.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
        Загрузка сотрудников…
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl">
            {kind === "MOUNT"
              ? "Монтажники"
              : "Кто работает"}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            {kind === "MOUNT"
              ? recommendedQty != null
                ? `Рекомендуется по смете: ${recommendedQty}. Можно поставить больше.`
                : "Монтажники отдельно от участников шоу. М — монтаж, Д — демонтаж; по умолчанию оба."
              : showZoneTabs
                ? "Назначение по зонам. Число строк — по проданным услугам со ставкой, не по дням. Даты зоны задают, когда люди видны в календаре Сроста."
                : showDayTabs
                ? "Назначение по дням. Если на всех днях одни и те же люди, в карточке список будет общим."
                : noPay
                  ? "Пустые строки — должности из сметы; ФИО можно назначить позже."
                  : "Штатные и фрилансеры; у фрилансера — ставка смены и фирма для расходки."}
          </p>
        </div>
        {!noPay && (
          <p className="text-sm">
            ФОТ:{" "}
            <span className="font-medium tabular-nums">{formatMoney(total)}</span>
          </p>
        )}
      </div>

      {showLayoutToggle && (
        <div className="mb-2 flex flex-wrap gap-1 text-sm">
          <button
            type="button"
            className={
              layoutMode === "days"
                ? "rounded-md bg-[var(--accent)] px-3 py-1 text-white"
                : "rounded-md border border-[var(--line)] px-3 py-1 text-[var(--muted)]"
            }
            onClick={() => setLayoutMode("days")}
          >
            По дням
          </button>
          <button
            type="button"
            className={
              layoutMode === "zones"
                ? "rounded-md bg-[var(--accent)] px-3 py-1 text-white"
                : "rounded-md border border-[var(--line)] px-3 py-1 text-[var(--muted)]"
            }
            onClick={() => setLayoutMode("zones")}
          >
            По зонам
          </button>
        </div>
      )}

      {showDayTabs && (
        <div className="mb-3 flex flex-wrap gap-1">
          {Array.from({ length: eventDays }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              type="button"
              className={
                dayTab === d
                  ? "rounded-md bg-[var(--accent)] px-3 py-1 text-sm text-white"
                  : "rounded-md border border-[var(--line)] px-3 py-1 text-sm text-[var(--muted)]"
              }
              onClick={() => setDayTab(d)}
            >
              День {d}
            </button>
          ))}
        </div>
      )}

      {showZoneTabs && (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {(activeZones.length > 0 ? activeZones : zoneList).map((z) => {
              const hint = formatZoneDateHint(
                z.workingDayIndexes ?? [],
                eventDays,
                eventDateText,
              );
              return (
                <button
                  key={z.id}
                  type="button"
                  className={
                    zoneTab === z.id
                      ? "rounded-md bg-[var(--accent)] px-3 py-1 text-left text-sm text-white"
                      : "rounded-md border border-[var(--line)] px-3 py-1 text-left text-sm text-[var(--muted)]"
                  }
                  onClick={() => setZoneTab(z.id)}
                >
                  <span className="block leading-tight">{z.name}</span>
                  {hint ? (
                    <span
                      className={
                        zoneTab === z.id
                          ? "block text-caption text-white/80"
                          : "block text-caption"
                      }
                    >
                      {hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {canEdit && zoneTab ? (
            eventStartDate && selectedZoneRange ? (
              <DateRangePicker
                dense
                label="Даты зоны"
                emptyLabel="Выберите даты зоны…"
                date={selectedZoneRange.date}
                durationDays={selectedZoneRange.durationDays}
                onChange={(date, durationDays) => {
                  const rangeStart = parseEventDate(date);
                  if (!rangeStart || !eventStartDate) return;
                  void saveZoneWorkingDays(
                    zoneTab,
                    workingDayIndexesFromRange(
                      eventStartDate,
                      eventDays,
                      rangeStart,
                      durationDays,
                    ),
                  );
                }}
              />
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Сначала укажите даты мероприятия — по ним зона попадёт в календарь Сроста.
              </p>
            )
          ) : null}
        </div>
      )}

      {canEdit && (
        <>
          <div className="mb-2 flex gap-1 text-sm">
            <button
              type="button"
              className={
                mode === "staff"
                  ? "rounded-md bg-[var(--accent)] px-3 py-1 text-white"
                  : "rounded-md border border-[var(--line)] px-3 py-1 text-[var(--muted)]"
              }
              onClick={() => {
                setMode("staff");
                setError("");
              }}
            >
              Сотрудник
            </button>
            <button
              type="button"
              className={
                mode === "freelancer"
                  ? "rounded-md bg-[var(--accent)] px-3 py-1 text-white"
                  : "rounded-md border border-[var(--line)] px-3 py-1 text-[var(--muted)]"
              }
              onClick={() => {
                setMode("freelancer");
                setError("");
              }}
            >
              Фрилансер
            </button>
          </div>

          {mode === "staff" ? (
            <div
              className={
                compact
                  ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 sm:grid-cols-2"
                  : noPay
                    ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-3"
                    : "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-6"
              }
            >
              {kind !== "MOUNT" && (
              <label
                className={compact || noPay ? "text-sm" : "text-sm md:col-span-2"}
              >
                <span className="text-[var(--muted)]">Должность</span>
                <select
                  className="field mt-1"
                  value={specialtyId}
                  onChange={(e) => setSpecialtyId(e.target.value)}
                >
                  <option value="">Сначала выберите должность</option>
                  {allSpecialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {noPay
                        ? s.name
                        : `${s.name}${s.shiftRate != null ? ` (смена ${s.shiftRate})` : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              )}
              <label
                className={compact || noPay ? "text-sm" : "text-sm md:col-span-2"}
              >
                <span className="text-[var(--muted)]">Сотрудник</span>
                <select
                  className="field mt-1"
                  value={userId}
                  disabled={kind !== "MOUNT" && !specialtyId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">
                    {kind !== "MOUNT" && !specialtyId
                      ? "Сначала должность"
                      : "—"}
                  </option>
                  {staffOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              {!noPay && kind !== "MOUNT" && (
                <>
                  <label className="text-sm">
                    <span className="text-[var(--muted)]">Режим</span>
                    <select
                      className="field mt-1"
                      value={payMode}
                      onChange={(e) =>
                        setPayMode(e.target.value as "SHIFT" | "HOURLY")
                      }
                    >
                      <option value="SHIFT">Смена</option>
                      <option value="HOURLY">Часы</option>
                    </select>
                  </label>
                  {payMode === "HOURLY" ? (
                    <label className="text-sm">
                      <span className="text-[var(--muted)]">Часов</span>
                      <input
                        type="number"
                        min={0}
                        className="field mt-1"
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value) || 0)}
                      />
                    </label>
                  ) : (
                    <label className="text-sm">
                      <span className="text-[var(--muted)]">Override ставки</span>
                      <input
                        type="number"
                        min={0}
                        className="field mt-1"
                        placeholder={
                          selectedSpec ? String(selectedSpec.shiftRate) : "база"
                        }
                        value={rateOverride}
                        onChange={(e) => setRateOverride(e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              {!noPay && kind === "MOUNT" && (
                <label className="text-sm">
                  <span className="text-[var(--muted)]">Override ставки</span>
                  <input
                    type="number"
                    min={0}
                    className="field mt-1"
                    placeholder="база"
                    value={rateOverride}
                    onChange={(e) => setRateOverride(e.target.value)}
                  />
                </label>
              )}
              <div
                className={
                  compact
                    ? "flex items-end sm:col-span-2"
                    : noPay
                      ? "flex items-end"
                      : "flex items-end md:col-span-6"
                }
              >
                <button
                  type="button"
                  disabled={checkingBusy}
                  onClick={() => void addStaff()}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {checkingBusy ? "Проверка…" : "Назначить"}
                </button>
                {error && (
                  <span className="ml-3 text-sm text-[var(--danger)]">
                    {error}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              className={
                compact
                  ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 sm:grid-cols-2"
                  : noPay
                    ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-3"
                    : "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-5"
              }
            >
              {kind !== "MOUNT" && (
              <label className="text-sm">
                <span className="text-[var(--muted)]">Должность</span>
                <select
                  className="field mt-1"
                  value={freelancerSpecialtyId}
                  onChange={(e) => setFreelancerSpecialtyId(e.target.value)}
                >
                  {allSpecialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              )}
              <label className="text-sm">
                <span className="text-[var(--muted)]">ФИО</span>
                <FreelancerQuickSearch
                  value={freelancerName}
                  onChange={setFreelancerName}
                  placeholder="Можно заполнить позже"
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">Фирма</span>
                <select
                  className="field mt-1"
                  value={freelancerOwner}
                  onChange={(e) =>
                    setFreelancerOwner(
                      e.target.value as CatalogOwnerValue | "",
                    )
                  }
                >
                  <option value="">—</option>
                  {CATALOG_OWNERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.short} — {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {!noPay && (
                <label className="text-sm">
                  <span className="text-[var(--muted)]">Ставка за смену</span>
                  <input
                    type="number"
                    min={0}
                    className="field mt-1"
                    placeholder="0"
                    value={freelancerRate}
                    onChange={(e) => setFreelancerRate(e.target.value)}
                  />
                </label>
              )}
              <div
                className={
                  compact
                    ? "flex items-end sm:col-span-2"
                    : "flex items-end"
                }
              >
                <button
                  type="button"
                  onClick={() => void addFreelancer()}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white"
                >
                  Добавить фрилансера
                </button>
                {error && (
                  <span className="ml-3 text-sm text-[var(--danger)]">
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="data-table-shell min-h-0 flex-1">
        <table
          className={`data-table ${canEdit ? "data-table--editable " : ""}${
            compact
              ? "w-full min-w-[320px] text-sm"
              : "w-full min-w-[600px] text-sm"
          }`}
        >
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-2 py-2 text-left">Сотрудник</th>
              {kind !== "MOUNT" && (
                <th className="px-2 py-2 text-left">Зона</th>
              )}
              <th className="px-2 py-2 text-left">Фирма</th>
              {kind !== "MOUNT" && (
                <th className="px-2 py-2 text-left">Должность</th>
              )}
              {kind === "MOUNT" && (
                <th className="px-2 py-2 text-left">М / Д</th>
              )}
              {!noPay && (
                <>
                  {kind !== "MOUNT" && (
                    <th className="px-2 py-2 text-left">Режим</th>
                  )}
                  <th className="px-2 py-2 text-right">Ставка / override</th>
                  <th className="px-2 py-2 text-right">К выплате</th>
                </>
              )}
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const vacant = !a.userId && !a.isFreelancer;
              const fl = a.isFreelancer;
              const firmOwners = fl ? a.owners : a.user?.owners;
              return (
                <tr key={a.id} className="border-t border-[var(--line)]">
                  <td className="px-2 py-2">
                    {canEdit && !fl ? (
                      <select
                        className="field max-w-[220px]"
                        value={a.userId || ""}
                        disabled={checkingBusy}
                        onChange={(e) => {
                          void changeSlotUser(
                            a.id,
                            e.target.value,
                            a.userId,
                          );
                        }}
                      >
                        <option value="">не назначен</option>
                        {staffOptionsForRow(a).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    ) : vacant ? (
                      <span className="text-[var(--muted)]">не назначен</span>
                    ) : fl && canEdit ? (
                      <div className="flex flex-col gap-0.5">
                        <AssignmentFreelancerName
                          name={a.freelancerName}
                          onCommit={(next) =>
                            void patchAssignment(a.id, {
                              freelancerName: next,
                            })
                          }
                        />
                        <span className="text-caption text-[var(--muted)]">
                          Фрилансер
                        </span>
                      </div>
                    ) : (
                      <span>
                        {fl
                          ? a.freelancerName.trim() || "Фрилансер"
                          : a.user?.name || "Сотрудник"}
                        {fl && (
                          <span className="ml-1 text-caption text-[var(--muted)]">
                            (фр.)
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  {kind !== "MOUNT" && (
                  <td className="px-2 py-2">
                    {canEdit && zoneList.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <select
                          className="field max-w-[160px]"
                          value={a.zoneId || ""}
                          onChange={(e) =>
                            void patchAssignment(a.id, {
                              zoneId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">—</option>
                          {zoneList.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                          {a.zoneId &&
                            !zoneList.some((z) => z.id === a.zoneId) && (
                              <option value={a.zoneId}>
                                {a.zone?.name || "зона"}
                              </option>
                            )}
                        </select>
                        {a.zoneId ? (
                          <span className="text-caption text-[var(--muted)]">
                            {formatZoneDateHint(
                              zoneList.find((z) => z.id === a.zoneId)
                                ?.workingDayIndexes ?? [],
                              eventDays,
                              eventDateText,
                            )}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">
                        {zoneLabel(a) || "—"}
                      </span>
                    )}
                  </td>
                  )}
                  <td className="px-2 py-2">
                    {fl && canEdit ? (
                      <select
                        className="field max-w-[100px] text-xs"
                        value={a.owners[0] || ""}
                        onChange={(e) =>
                          void patchAssignment(a.id, {
                            owners: e.target.value
                              ? [e.target.value as CatalogOwnerValue]
                              : [],
                          })
                        }
                      >
                        <option value="">—</option>
                        {CATALOG_OWNERS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.short}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <FirmBadges owners={firmOwners} />
                    )}
                  </td>
                  {kind !== "MOUNT" && (
                  <td className="px-2 py-2">
                    {canEdit && allSpecialties.length > 0 ? (
                      <select
                        className="field max-w-[200px]"
                        value={a.specialtyId}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next && next !== a.specialtyId) {
                            void patchAssignment(a.id, { specialtyId: next });
                          }
                        }}
                      >
                        {!allSpecialties.some((s) => s.id === a.specialtyId) && (
                          <option value={a.specialtyId}>
                            {a.specialty.name}
                          </option>
                        )}
                        {allSpecialties.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      a.specialty.name
                    )}
                  </td>
                  )}
                  {kind === "MOUNT" && (
                    <td className="px-2 py-2">
                      <MountDutyToggles
                        assignment={a}
                        disabled={!canEdit}
                        onChange={(next) =>
                          void patchAssignment(a.id, next)
                        }
                      />
                    </td>
                  )}
                  {!noPay && (
                    <>
                      {kind !== "MOUNT" && (
                      <td className="px-2 py-2">
                        {fl
                          ? "Смена"
                          : a.payMode === "HOURLY"
                            ? `${a.hours ?? 0} ч × ${formatMoney(a.hourlyRate)}`
                            : "Смена"}
                      </td>
                      )}
                      <td className="px-2 py-2 text-right">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            className="field ml-auto max-w-[120px] text-right"
                            placeholder={
                              fl
                                ? "ставка"
                                : String(
                                    a.payMode === "HOURLY"
                                      ? (a.hours || 0) * a.hourlyRate
                                      : a.shiftRate,
                                  )
                            }
                            defaultValue={a.rateOverride ?? ""}
                            onBlur={(e) =>
                              void patchAssignment(a.id, {
                                rateOverride:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        ) : a.rateOverride != null ? (
                          formatMoney(a.rateOverride)
                        ) : a.payMode === "SHIFT" ? (
                          formatMoney(a.shiftRate)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatMoney(a.pay)}
                      </td>
                    </>
                  )}
                  {canEdit && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="btn-icon text-[var(--danger)]"
                        onClick={() => {
                          const vacant = !a.userId && !a.isFreelancer;
                          const who = vacant
                            ? `пустой слот «${a.specialty.name}»`
                            : `${
                                a.isFreelancer
                                  ? a.freelancerName.trim() || "фрилансера"
                                  : a.user?.name || "сотрудника"
                              } (${a.specialty.name})`;
                          if (!confirm(`Удалить ${who}?`)) return;
                          void removeAssignment(a.id);
                        }}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-6 text-center text-[var(--muted)]"
                >
                  {kind === "MOUNT"
                    ? "Монтажники ещё не назначены"
                    : "Сотрудники ещё не назначены"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(conflictWarn)}
        onClose={dismissConflict}
        title={
          conflictWarn?.dayOffs.length
            ? "У сотрудника выходной"
            : "Сотрудник уже занят"
        }
        className="max-w-md"
      >
        {conflictWarn && (
          <div className="mt-3 space-y-3">
            {conflictWarn.dayOffs.length > 0 && (
              <>
                <p className="text-sm text-[var(--ink)]">
                  <span className="font-medium">{conflictWarn.userName}</span>{" "}
                  в эти дни в выходном / отсутствии — назначить на работу
                  нельзя:
                </p>
                <ul className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
                  {conflictWarn.dayOffs.map((d) => (
                    <li key={d.id} className="text-[var(--ink)]">
                      {dayOffLabel(d)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {conflictWarn.calendarBusy.length > 0 && (
              <>
                <p className="text-sm text-[var(--ink)]">
                  <span className="font-medium">{conflictWarn.userName}</span>{" "}
                  занят арендой или задачей в пересекающиеся дни:
                </p>
                <ul className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
                  {conflictWarn.calendarBusy.map((c) => (
                    <li key={c.id} className="text-[var(--ink)]">
                      {calendarBusyLabel(c)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {conflictWarn.conflicts.length > 0 && (
              <>
                <p className="text-sm text-[var(--ink)]">
                  <span className="font-medium">{conflictWarn.userName}</span>{" "}
                  уже назначен на другое мероприятие в пересекающиеся дни:
                </p>
                <ul className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
                  {conflictWarn.conflicts.map((c) => (
                    <li key={c.quoteId} className="text-[var(--ink)]">
                      {conflictLabel(c)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {conflictWarn.dayOffs.length > 0 ? (
              <p className="text-xs text-[var(--muted)]">
                Снимите выходной в календаре или выберите другого сотрудника.
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Можно всё равно назначить или выбрать другого сотрудника.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!pendingReplace) {
                    setUserId("");
                    setSpecialtyId("");
                  }
                  dismissConflict();
                }}
              >
                Выбрать другого
              </Button>
              {conflictWarn.dayOffs.length === 0 && (
                <Button
                  size="sm"
                  disabled={checkingBusy}
                  onClick={() => {
                    setCheckingBusy(true);
                    const finish = pendingReplace
                      ? patchAssignment(pendingReplace.assignmentId, {
                          userId: pendingReplace.userId,
                        }).then(() => {
                          dismissConflict();
                        })
                      : createStaffAssignment();
                    void finish.finally(() => setCheckingBusy(false));
                  }}
                >
                  Назначить всё равно
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function MountDutyToggles({
  assignment,
  disabled,
  onChange,
}: {
  assignment: Assignment;
  disabled: boolean;
  onChange: (next: { onMount: boolean; onDemount: boolean }) => void;
}) {
  const { onMount, onDemount } = mountDutyFlags(assignment);
  function toggle(field: "onMount" | "onDemount") {
    const next = {
      onMount: field === "onMount" ? !onMount : onMount,
      onDemount: field === "onDemount" ? !onDemount : onDemount,
    };
    if (!next.onMount && !next.onDemount) return;
    onChange(next);
  }
  return (
    <div className="inline-flex gap-0.5">
      <button
        type="button"
        title="Был на монтаже"
        disabled={disabled}
        onClick={() => toggle("onMount")}
        className={
          onMount
            ? "inline-flex size-7 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-semibold text-white disabled:opacity-60"
            : "inline-flex size-7 items-center justify-center rounded-md border border-[var(--line)] text-xs font-semibold text-[var(--muted)] disabled:opacity-60"
        }
      >
        М
      </button>
      <button
        type="button"
        title="Был на демонтаже"
        disabled={disabled}
        onClick={() => toggle("onDemount")}
        className={
          onDemount
            ? "inline-flex size-7 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-semibold text-white disabled:opacity-60"
            : "inline-flex size-7 items-center justify-center rounded-md border border-[var(--line)] text-xs font-semibold text-[var(--muted)] disabled:opacity-60"
        }
      >
        Д
      </button>
    </div>
  );
}
