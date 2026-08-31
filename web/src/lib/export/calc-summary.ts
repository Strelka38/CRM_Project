import {
  allocateByRevenueShare,
  CATALOG_OWNERS,
  splitAmongOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { parseEventDate } from "@/lib/dates";
import type { CalcExpenseInput } from "@/lib/quote-calculation";

/** Порядок колонок выручки в шаблоне бухгалтерии: NE, ДК, ШМ. */
export const FIRM_COLUMN_ORDER: CatalogOwnerValue[] = [
  "NE_EVENT",
  "DIAKOM",
  "SHOW_MASTER",
];

export const FIRM_SHEETS: Array<{
  company: CatalogOwnerValue;
  sheetName: string;
  titleFirm: string;
  short: string;
}> = [
  { company: "NE_EVENT", sheetName: "NE", titleFirm: "NeEvent", short: "NE" },
  { company: "DIAKOM", sheetName: "ДК", titleFirm: "Диаком", short: "ДК" },
  {
    company: "SHOW_MASTER",
    sheetName: "ШМ",
    titleFirm: "Шоу-Мастер",
    short: "ШМ",
  },
];

export function emptyCompanyAmounts(): Record<CatalogOwnerValue, number> {
  return { SHOW_MASTER: 0, DIAKOM: 0, NE_EVENT: 0 };
}

export function allocateAmountByOwners(
  amount: number,
  owners: CatalogOwnerValue[] | null | undefined,
  revenueByCompany: Partial<Record<CatalogOwnerValue, number>>,
): Record<CatalogOwnerValue, number> {
  const value = Math.max(0, Number(amount) || 0);
  const split = splitAmongOwners(value, owners);
  if (Object.keys(split).length > 0) {
    const out = emptyCompanyAmounts();
    for (const c of CATALOG_OWNERS) {
      out[c.value] = Math.round(split[c.value] ?? 0);
    }
    return out;
  }
  const byRev = allocateByRevenueShare(value, revenueByCompany);
  for (const c of CATALOG_OWNERS) {
    byRev[c.value] = Math.round(byRev[c.value] ?? 0);
  }
  return byRev;
}

/** Доп. расходы (без фриланса) по фирмам — как в калькуляции. */
export function allocateExpenseInputs(
  expenses: CalcExpenseInput[],
  revenueByCompany: Partial<Record<CatalogOwnerValue, number>>,
): Record<CatalogOwnerValue, number> {
  const out = emptyCompanyAmounts();
  for (const exp of expenses) {
    const mode = exp.mode ?? "SHARE";
    if (mode === "AMOUNT" && exp.amounts) {
      for (const c of CATALOG_OWNERS) {
        out[c.value] += Math.max(0, Number(exp.amounts[c.value]) || 0);
      }
      continue;
    }
    const amount = Math.max(0, Number(exp.amount) || 0);
    if (amount <= 0) continue;
    let owners = (exp.owners ?? []) as CatalogOwnerValue[];
    if (owners.length === 0 && exp.company) {
      owners = [exp.company as CatalogOwnerValue];
    }
    const part = allocateAmountByOwners(amount, owners, revenueByCompany);
    for (const c of CATALOG_OWNERS) out[c.value] += part[c.value];
  }
  for (const c of CATALOG_OWNERS) {
    out[c.value] = Math.round(out[c.value]);
  }
  return out;
}

export type AssignmentLaborLike = {
  userId: string;
  userName: string;
  isFreelancer: boolean;
  vacant?: boolean;
  owners: CatalogOwnerValue[];
  pay: number;
  montageAmount: number;
};

export type SummaryPerson = {
  key: string;
  name: string;
  freelancer: boolean;
  amounts: Record<CatalogOwnerValue, number>;
};

export function personExportKey(row: AssignmentLaborLike): string | null {
  if (row.vacant || (!row.isFreelancer && !row.userId)) return null;
  if (row.isFreelancer) {
    const name = row.userName.trim() || "Фрилансер";
    return `fl:${name.toLowerCase()}`;
  }
  return `st:${row.userId}`;
}

/** Смена + монтажные + премии (pay уже с премией), разнесённые по фирмам. */
export function buildSummaryPeople(
  rows: AssignmentLaborLike[],
  revenueByCompany: Partial<Record<CatalogOwnerValue, number>>,
): SummaryPerson[] {
  const map = new Map<string, SummaryPerson>();
  for (const row of rows) {
    const key = personExportKey(row);
    if (!key) continue;
    const amount =
      Math.max(0, Number(row.pay) || 0) +
      Math.max(0, Number(row.montageAmount) || 0);
    if (amount <= 0) continue;
    const split = allocateAmountByOwners(amount, row.owners, revenueByCompany);
    const existing = map.get(key);
    if (existing) {
      for (const c of CATALOG_OWNERS) {
        existing.amounts[c.value] += split[c.value];
      }
      continue;
    }
    map.set(key, {
      key,
      name: row.userName.trim() || (row.isFreelancer ? "Фрилансер" : "Сотрудник"),
      freelancer: row.isFreelancer,
      amounts: split,
    });
  }
  return [...map.values()];
}

export type SummaryEvent = {
  id: string;
  title: string;
  date: Date | null;
  managerName: string;
  revenue: Record<CatalogOwnerValue, number>;
  agency: Record<CatalogOwnerValue, number>;
  agencyCost: Record<CatalogOwnerValue, number>;
  extra: Record<CatalogOwnerValue, number>;
  cogs: Record<CatalogOwnerValue, number>;
  people: SummaryPerson[];
};

export type CalcListRowForSummary = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  eventDate?: string | Date | null;
  owner: { name: string };
  breakdown: Array<{
    company: CatalogOwnerValue;
    revenue: number;
    cogs?: number;
    agency?: number;
    agencyCost?: number;
  }>;
  extraByCompany?: Partial<Record<CatalogOwnerValue, number>>;
  people?: SummaryPerson[];
};

export function parseSummaryDate(
  eventDate?: string | Date | null,
  dateText?: string,
): Date | null {
  if (eventDate instanceof Date && !Number.isNaN(eventDate.getTime())) {
    return eventDate;
  }
  if (typeof eventDate === "string" && eventDate.trim()) {
    const iso = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    }
    const d = new Date(eventDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return parseEventDate(dateText ?? "");
}

export function eventTitle(proposalNumber: string, eventName: string): string {
  const name = (eventName || "").trim();
  const num = (proposalNumber || "").trim();
  if (num && name) return `№${num} ${name}`;
  if (num) return `№${num}`;
  return name || "Без названия";
}

export function summaryEventFromCalcRow(row: CalcListRowForSummary): SummaryEvent {
  const revenue = emptyCompanyAmounts();
  const cogs = emptyCompanyAmounts();
  const agency = emptyCompanyAmounts();
  const agencyCost = emptyCompanyAmounts();
  for (const b of row.breakdown ?? []) {
    revenue[b.company] = Math.round(b.revenue ?? 0);
    cogs[b.company] = Math.round(b.cogs ?? 0);
    agency[b.company] = Math.round(b.agency ?? 0);
    agencyCost[b.company] = Math.round(b.agencyCost ?? 0);
  }
  const extra = emptyCompanyAmounts();
  for (const c of CATALOG_OWNERS) {
    extra[c.value] = Math.round(row.extraByCompany?.[c.value] ?? 0);
  }
  return {
    id: row.id,
    title: eventTitle(row.proposalNumber, row.eventName),
    date: parseSummaryDate(row.eventDate, row.date),
    managerName: row.owner?.name || "—",
    revenue,
    agency,
    agencyCost,
    extra,
    cogs,
    people: row.people ?? [],
  };
}

export type SummaryPersonColumn = {
  key: string;
  name: string;
  freelancer: boolean;
};

export type SummarySheetRow = {
  title: string;
  date: Date | null;
  managerName: string;
  firmRevenue: Record<CatalogOwnerValue, number>;
  personAmounts: Record<string, number>;
  expenses: number;
  agency: Record<CatalogOwnerValue, number>;
};

export type SummarySheetModel = {
  company: CatalogOwnerValue;
  sheetName: string;
  titleFirm: string;
  short: string;
  from: Date | null;
  to: Date | null;
  personColumns: SummaryPersonColumn[];
  rows: SummarySheetRow[];
  totals: {
    firmRevenue: Record<CatalogOwnerValue, number>;
    personAmounts: Record<string, number>;
    expenses: number;
    agency: Record<CatalogOwnerValue, number>;
  };
};

function sortEvents(events: SummaryEvent[]): SummaryEvent[] {
  return [...events].sort((a, b) => {
    const at = a.date?.getTime() ?? 0;
    const bt = b.date?.getTime() ?? 0;
    if (at !== bt) return at - bt;
    return a.title.localeCompare(b.title, "ru");
  });
}

export function buildSummarySheet(
  events: SummaryEvent[],
  company: CatalogOwnerValue,
): SummarySheetModel {
  const meta = FIRM_SHEETS.find((s) => s.company === company);
  if (!meta) {
    throw new Error(`Unknown firm ${company}`);
  }
  const sorted = sortEvents(events);
  const peopleMap = new Map<string, SummaryPersonColumn>();
  for (const ev of sorted) {
    for (const p of ev.people) {
      if ((p.amounts[company] ?? 0) <= 0) continue;
      if (!peopleMap.has(p.key)) {
        peopleMap.set(p.key, {
          key: p.key,
          name: p.name,
          freelancer: p.freelancer,
        });
      }
    }
  }
  const personColumns = [...peopleMap.values()].sort((a, b) => {
    if (a.freelancer !== b.freelancer) return a.freelancer ? 1 : -1;
    return a.name.localeCompare(b.name, "ru");
  });

  const dates = sorted.map((e) => e.date).filter((d): d is Date => d != null);
  const from = dates.length
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : null;
  const to = dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null;

  const totals = {
    firmRevenue: emptyCompanyAmounts(),
    personAmounts: {} as Record<string, number>,
    expenses: 0,
    agency: emptyCompanyAmounts(),
  };

  const rows = sorted.map((ev) => {
    const firmRevenue = emptyCompanyAmounts();
    for (const c of CATALOG_OWNERS) {
      const raw = ev.revenue[c.value] ?? 0;
      firmRevenue[c.value] =
        c.value === company
          ? Math.round(raw - (ev.agencyCost[c.value] ?? 0))
          : Math.round(raw);
      totals.firmRevenue[c.value] += firmRevenue[c.value];
    }
    const personAmounts: Record<string, number> = {};
    for (const col of personColumns) {
      const person = ev.people.find((p) => p.key === col.key);
      const amt = Math.round(person?.amounts[company] ?? 0);
      personAmounts[col.key] = amt;
      totals.personAmounts[col.key] = (totals.personAmounts[col.key] ?? 0) + amt;
    }
    const expenses = Math.round((ev.extra[company] ?? 0) + (ev.cogs[company] ?? 0));
    totals.expenses += expenses;
    const agency = emptyCompanyAmounts();
    for (const c of CATALOG_OWNERS) {
      agency[c.value] = Math.round(ev.agency[c.value] ?? 0);
      totals.agency[c.value] += agency[c.value];
    }
    return {
      title: ev.title,
      date: ev.date,
      managerName: ev.managerName,
      firmRevenue,
      personAmounts,
      expenses,
      agency,
    };
  });

  return { ...meta, from, to, personColumns, rows, totals };
}

export function buildSummarySheets(events: SummaryEvent[]): SummarySheetModel[] {
  return FIRM_SHEETS.map((s) => buildSummarySheet(events, s.company));
}
