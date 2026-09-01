import ExcelJS from "exceljs";
import { OWNER_SHORT, type CatalogOwnerValue } from "@/lib/catalog-owner";
import { safeFilename } from "@/lib/format";
import {
  buildSummarySheets,
  emptyCompanyAmounts,
  FIRM_COLUMN_ORDER,
  type SummaryEvent,
  type SummarySheetModel,
} from "./calc-summary";

const FONT: Partial<ExcelJS.Font> = {
  name: "Aptos Narrow",
  size: 12,
  family: 2,
  charset: 204,
};

const THIN: ExcelJS.BorderStyle = "thin";
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: THIN },
  left: { style: THIN },
  bottom: { style: THIN },
  right: { style: THIN },
};
const MONEY_FMT = "#,##0";
const DATE_FMT = "dd.mm.yyyy";
const DATA_START = 5;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function paint(
  cell: ExcelJS.Cell,
  opts: {
    value?: ExcelJS.CellValue;
    bold?: boolean;
    align?: ExcelJS.Alignment["horizontal"];
    valign?: ExcelJS.Alignment["vertical"];
    wrap?: boolean;
    numFmt?: string;
    italic?: boolean;
  } = {},
) {
  cell.font = { ...FONT, bold: Boolean(opts.bold), italic: Boolean(opts.italic) };
  cell.alignment = {
    horizontal: opts.align ?? "left",
    vertical: opts.valign ?? "top",
    wrapText: Boolean(opts.wrap),
  };
  cell.border = BORDER;
  if (opts.value !== undefined) cell.value = opts.value;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

function moneyCell(
  cell: ExcelJS.Cell,
  value: number | ExcelJS.CellFormulaValue,
  bold = false,
) {
  paint(cell, { value, align: "right", numFmt: MONEY_FMT, bold });
}

type ColLayout = {
  name: number;
  date: number;
  manager: number;
  firms: Record<CatalogOwnerValue, number>;
  people: Record<string, number>;
  expenses: number;
  agency: Record<CatalogOwnerValue, number>;
  last: number;
};

/** A название, B дата, C менеджер, D–F служебные (период в шапке), G–I фирмы. */
function layoutOf(model: SummarySheetModel): ColLayout {
  const firms = {
    NE_EVENT: 7,
    DIAKOM: 8,
    SHOW_MASTER: 9,
  } as Record<CatalogOwnerValue, number>;
  const people: Record<string, number> = {};
  let col = 10;
  for (const p of model.personColumns) {
    people[p.key] = col++;
  }
  const expenses = col++;
  const agency = {} as Record<CatalogOwnerValue, number>;
  FIRM_COLUMN_ORDER.forEach((c) => {
    agency[c] = col++;
  });
  return {
    name: 1,
    date: 2,
    manager: 3,
    firms,
    people,
    expenses,
    agency,
    last: col - 1,
  };
}

function writeSheet(wb: ExcelJS.Workbook, model: SummarySheetModel) {
  const ws = wb.addWorksheet(model.sheetName, {
    views: [
      {
        state: "frozen",
        xSplit: 3,
        ySplit: 3,
        topLeftCell: "D4",
        showGridLines: true,
        zoomScale: 85,
      },
    ],
  });
  const L = layoutOf(model);
  const lastData = DATA_START + Math.max(model.rows.length, 1) - 1;
  const totalsRow = lastData + 1;

  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 8;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 8;
  for (const c of FIRM_COLUMN_ORDER) {
    ws.getColumn(L.firms[c]).width = 14;
    ws.getColumn(L.agency[c]).width = 16;
  }
  for (const p of model.personColumns) {
    ws.getColumn(L.people[p.key]).width = Math.min(
      22,
      Math.max(14, p.name.length + 2),
    );
  }
  ws.getColumn(L.expenses).width = 16;

  paint(ws.getCell(1, 1), {
    value: `Сводная таблица доходность (${model.titleFirm})`,
    bold: true,
  });
  paint(ws.getCell(1, 2), { value: "от", align: "right" });
  paint(ws.getCell(1, 3), {
    value: model.from ?? undefined,
    numFmt: DATE_FMT,
    align: "center",
  });
  paint(ws.getCell(1, 4), { value: "до", align: "right" });
  paint(ws.getCell(1, 5), {
    value: model.to ?? undefined,
    numFmt: DATE_FMT,
    align: "center",
  });
  paint(ws.getCell(1, 6));

  for (const company of FIRM_COLUMN_ORDER) {
    const col = L.firms[company];
    ws.mergeCells(1, col, 3, col);
    paint(ws.getCell(1, col), {
      value: OWNER_SHORT[company],
      bold: true,
      align: "center",
      valign: "middle",
    });
  }

  ws.mergeCells(2, 4, 2, 6);
  paint(ws.getCell(2, 4));
  paint(ws.getCell(2, 5));
  paint(ws.getCell(2, 6));

  if (model.personColumns.length > 0) {
    const first = L.people[model.personColumns[0].key];
    const lastP = L.people[model.personColumns[model.personColumns.length - 1].key];
    ws.mergeCells(2, first, 2, lastP);
    paint(ws.getCell(2, first), {
      value: `только сотрудники и фрилансеры, которым платил ${model.titleFirm}`,
      align: "center",
      wrap: true,
      italic: true,
    });
    for (let c = first + 1; c <= lastP; c++) paint(ws.getCell(2, c));
  }

  paint(ws.getCell(2, 1));
  paint(ws.getCell(2, 2));
  paint(ws.getCell(2, 3));
  paint(ws.getCell(2, L.expenses));
  for (const company of FIRM_COLUMN_ORDER) {
    paint(ws.getCell(2, L.agency[company]));
  }

  paint(ws.getCell(3, 1), {
    value: "Название мероприятия (аренда)",
    bold: true,
  });
  paint(ws.getCell(3, 2), { value: "дата", bold: true, align: "center" });
  paint(ws.getCell(3, 3), { value: "Менеджер", bold: true });
  paint(ws.getCell(3, 4));
  paint(ws.getCell(3, 5));
  paint(ws.getCell(3, 6));

  for (const p of model.personColumns) {
    paint(ws.getCell(3, L.people[p.key]), {
      value: p.name,
      bold: true,
      wrap: true,
    });
  }
  paint(ws.getCell(3, L.expenses), { value: "Расходы", bold: true, wrap: true });
  paint(ws.getCell(3, L.agency.NE_EVENT), {
    value: "Агентские НЕЕ",
    bold: true,
    wrap: true,
  });
  paint(ws.getCell(3, L.agency.DIAKOM), {
    value: "Агентские ДК",
    bold: true,
    wrap: true,
  });
  paint(ws.getCell(3, L.agency.SHOW_MASTER), {
    value: "Агентские ШМ",
    bold: true,
    wrap: true,
  });

  const hintRow = ws.getRow(4);
  hintRow.height = 48;
  paint(ws.getCell(4, 1));
  paint(ws.getCell(4, 2));
  paint(ws.getCell(4, 3), {
    value: "менеджер проекта",
    italic: true,
    wrap: true,
  });
  paint(ws.getCell(4, 4));
  paint(ws.getCell(4, 5));
  paint(ws.getCell(4, 6));
  for (const company of FIRM_COLUMN_ORDER) {
    paint(ws.getCell(4, L.firms[company]), {
      value:
        company === model.company
          ? "выручка − агентские менеджера"
          : "выручка",
      italic: true,
      wrap: true,
      align: "center",
    });
  }
  if (model.personColumns.length > 0) {
    const first = L.people[model.personColumns[0].key];
    const lastP = L.people[model.personColumns[model.personColumns.length - 1].key];
    if (lastP > first) ws.mergeCells(4, first, 4, lastP);
    paint(ws.getCell(4, first), {
      value: "смена + монтажные + премии за этот ивент",
      italic: true,
      wrap: true,
    });
    for (let c = first + 1; c <= lastP; c++) paint(ws.getCell(4, c));
  }
  paint(ws.getCell(4, L.expenses), {
    value: "сумма доп. расходов + закупа на мероприятие",
    italic: true,
    wrap: true,
  });
  for (const company of FIRM_COLUMN_ORDER) {
    paint(ws.getCell(4, L.agency[company]));
  }

  const writeDataRow = (
    excelRow: number,
    row: SummarySheetModel["rows"][number],
  ) => {
    paint(ws.getCell(excelRow, 1), { value: row.title, wrap: true });
    paint(ws.getCell(excelRow, 2), {
      value: row.date ?? undefined,
      numFmt: DATE_FMT,
      align: "center",
    });
    paint(ws.getCell(excelRow, 3), { value: row.managerName, wrap: true });
    paint(ws.getCell(excelRow, 4));
    paint(ws.getCell(excelRow, 5));
    paint(ws.getCell(excelRow, 6));
    for (const company of FIRM_COLUMN_ORDER) {
      moneyCell(
        ws.getCell(excelRow, L.firms[company]),
        row.firmRevenue[company] || 0,
      );
    }
    for (const p of model.personColumns) {
      moneyCell(
        ws.getCell(excelRow, L.people[p.key]),
        row.personAmounts[p.key] || 0,
      );
    }
    moneyCell(ws.getCell(excelRow, L.expenses), row.expenses || 0);
    for (const company of FIRM_COLUMN_ORDER) {
      moneyCell(
        ws.getCell(excelRow, L.agency[company]),
        row.agency[company] || 0,
      );
    }
  };

  if (model.rows.length === 0) {
    writeDataRow(DATA_START, {
      title: "",
      date: null,
      managerName: "",
      firmRevenue: emptyCompanyAmounts(),
      personAmounts: {},
      expenses: 0,
      agency: emptyCompanyAmounts(),
    });
  } else {
    model.rows.forEach((row, i) => writeDataRow(DATA_START + i, row));
  }

  const sumRef = (col: number) =>
    `SUM(${colLetter(col)}${DATA_START}:${colLetter(col)}${lastData})`;

  paint(ws.getCell(totalsRow, 1), { value: "Итого", bold: true });
  paint(ws.getCell(totalsRow, 2));
  paint(ws.getCell(totalsRow, 3));
  paint(ws.getCell(totalsRow, 4));
  paint(ws.getCell(totalsRow, 5));
  paint(ws.getCell(totalsRow, 6));
  for (const company of FIRM_COLUMN_ORDER) {
    moneyCell(ws.getCell(totalsRow, L.firms[company]), {
      formula: sumRef(L.firms[company]),
    }, true);
  }
  for (const p of model.personColumns) {
    moneyCell(ws.getCell(totalsRow, L.people[p.key]), {
      formula: sumRef(L.people[p.key]),
    }, true);
  }
  moneyCell(ws.getCell(totalsRow, L.expenses), {
    formula: sumRef(L.expenses),
  }, true);
  for (const company of FIRM_COLUMN_ORDER) {
    moneyCell(ws.getCell(totalsRow, L.agency[company]), {
      formula: sumRef(L.agency[company]),
    }, true);
  }
}

export async function buildCalcSummaryWorkbook(events: SummaryEvent[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BaikalStage CRM";
  wb.created = new Date();
  for (const sheet of buildSummarySheets(events)) {
    writeSheet(wb, sheet);
  }
  return wb;
}

export async function exportCalcSummaryExcel(events: SummaryEvent[]) {
  const wb = await buildCalcSummaryWorkbook(events);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${safeFilename(["сводная-калькуляции", stamp])}.xlsx`);
}
