import ExcelJS from "exceljs";
import { formatMoney } from "@/lib/format";
import { CATALOG_OWNERS, type CatalogOwnerValue } from "@/lib/catalog-owner";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type CalcExportPayload = {
  proposalNumber: string;
  eventName: string;
  date: string;
  client: string;
  ownerName: string;
  payable: number;
  cogsTotal: number;
  marginTotal: number;
  extraTotal: number;
  freelanceTotal: number;
  laborTotal: number;
  montageTotal: number;
  agencyTotal: number;
  netTotal: number;
  lines: Array<{
    name: string;
    client: number;
    cost: number;
    margin: number;
    owners: string;
  }>;
  autoExpenses: Array<{ name: string; amount: number }>;
  extras: Array<{ name: string; amount: number }>;
  specialists: Array<{
    name: string;
    specialty: string;
    freelancer: boolean;
    pay: number;
    montage: number;
  }>;
  breakdown: Array<{
    short: string;
    label: string;
    revenue: number;
    cogs: number;
    expenses: number;
    labor: number;
    montage: number;
    agency: number;
    net: number;
  }>;
};

/** Листы: шапка, позиции, расходы, специалисты, сводка по фирмам.
 *  Эталон бухгалтерии в репо нет — вёрстку можно подкрутить по их xlsx. */
export async function exportCalculationExcel(data: CalcExportPayload) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BaikalStage CRM";

  const cover = wb.addWorksheet("Шапка");
  cover.columns = [{ width: 28 }, { width: 40 }];
  const coverRows: Array<[string, string | number]> = [
    ["КП", data.proposalNumber],
    ["Мероприятие", data.eventName || "—"],
    ["Дата", data.date || "—"],
    ["Заказчик", data.client || "—"],
    ["Менеджер", data.ownerName],
    ["Сумма КП (клиент)", data.payable],
    ["Закуп", data.cogsTotal],
    ["Выручка (маржа)", data.marginTotal],
    ["Доп. расходы", data.extraTotal],
    ["Фриланс", data.freelanceTotal],
    ["ЗП штат", data.laborTotal],
    ["Монтажные", data.montageTotal],
    ["Агентские", data.agencyTotal],
    ["Нетто", data.netTotal],
  ];
  coverRows.forEach((row, i) => {
    cover.getCell(i + 1, 1).value = row[0];
    cover.getCell(i + 1, 2).value = row[1];
    cover.getCell(i + 1, 1).font = { bold: true };
  });

  const pos = wb.addWorksheet("Позиции");
  pos.columns = [
    { header: "Позиция", width: 40 },
    { header: "Клиенту", width: 14 },
    { header: "Закуп", width: 14 },
    { header: "Маржа", width: 14 },
    { header: "Владельцы", width: 16 },
  ];
  for (const l of data.lines) {
    pos.addRow([l.name, l.client, l.cost, l.margin, l.owners]);
  }

  const exp = wb.addWorksheet("Расходы");
  exp.columns = [
    { header: "Статья", width: 44 },
    { header: "Сумма", width: 14 },
  ];
  for (const e of data.autoExpenses) exp.addRow([e.name, e.amount]);
  for (const e of data.extras) exp.addRow([e.name, e.amount]);

  const spec = wb.addWorksheet("Специалисты");
  spec.columns = [
    { header: "Имя", width: 28 },
    { header: "Должность", width: 20 },
    { header: "Тип", width: 12 },
    { header: "ЗП / ставка", width: 14 },
    { header: "Монтаж", width: 14 },
  ];
  for (const s of data.specialists) {
    spec.addRow([
      s.name,
      s.specialty,
      s.freelancer ? "фриланс" : "штат",
      s.pay,
      s.montage,
    ]);
  }

  const firms = wb.addWorksheet("По фирмам");
  firms.columns = [
    { header: "Фирма", width: 16 },
    { header: "Маржа", width: 12 },
    { header: "Закуп", width: 12 },
    { header: "Расходы", width: 12 },
    { header: "ЗП", width: 12 },
    { header: "Монтаж", width: 12 },
    { header: "Агентские", width: 12 },
    { header: "Нетто", width: 12 },
  ];
  for (const b of data.breakdown) {
    firms.addRow([
      `${b.short} ${b.label}`,
      b.revenue,
      b.cogs,
      b.expenses,
      b.labor,
      b.montage,
      b.agency,
      b.net,
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(
    blob,
    `калькуляция-${data.proposalNumber || "kp"}.xlsx`,
  );
}

export function ownerShorts(owners: CatalogOwnerValue[]): string {
  return CATALOG_OWNERS.filter((o) => owners.includes(o.value))
    .map((o) => o.short)
    .join(", ");
}

export function formatMoneyLabel(n: number): string {
  return formatMoney(n);
}
