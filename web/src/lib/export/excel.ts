import ExcelJS from "exceljs";
import { proposalTitle, safeFilename, todayLabel } from "../format";
import type { calcDocument } from "../quote-calc";

type DocCalc = ReturnType<typeof calcDocument>;

type DocMeta = {
  proposalNumber: string;
  eventName: string;
  date: string;
  time: string;
  place: string;
  client: string;
  managerName: string;
  cashless: boolean;
  durationDays: number;
  notes: string[];
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportQuoteDocumentExcel(meta: DocMeta, calc: DocCalc) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM Event Rental";
  const ws = wb.addWorksheet("КП", {
    views: [{ state: "frozen", ySplit: 12 }],
  });

  ws.columns = [
    { key: "num", width: 6 },
    { key: "name", width: 72 },
    { key: "qty", width: 10 },
    { key: "price", width: 12 },
    { key: "day", width: 10 },
    { key: "sum", width: 14 },
  ];

  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = proposalTitle(meta.proposalNumber, todayLabel());
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.getCell("A3").value = "Сумма";
  ws.getCell("B3").value = calc.total;
  ws.getCell("B3").numFmt = '#,##0 "₽"';
  ws.getCell("B3").font = { bold: true, size: 14 };

  const fields: [string, string][] = [
    ["Мероприятие:", meta.eventName],
    ["Дата:", meta.date],
    ["Время:", meta.time],
    ["Место:", meta.place],
    ["Заказчик, контактная информация:", meta.client],
    [`Менеджер площадки: ${meta.managerName}`, ""],
  ];
  fields.forEach(([label, value], i) => {
    const row = 4 + i;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`B${row}`).value = value;
  });

  ws.getCell("A10").value = "Безналичный расчет";
  ws.getCell("B10").value = meta.cashless ? 1 : 0;
  ws.getCell("A11").value = "Продолжительность:";
  ws.getCell("B11").value = meta.durationDays;
  ws.getCell("C11").value = "день";

  const headerRow = ws.getRow(12);
  headerRow.values = [
    "№",
    "Оборудование",
    "Кол-во",
    "Цена, шт.",
    "День коэф",
    "Сумма, р.",
  ];
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF5" },
  };

  let rowIdx = 13;
  for (const section of calc.sections) {
    if (section.items.length === 0) continue;
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    const catCell = ws.getCell(`A${rowIdx}`);
    catCell.value = section.title;
    catCell.font = { bold: true };
    catCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF0F4F8" },
    };
    rowIdx += 1;

    section.items.forEach((line, i) => {
      const row = ws.getRow(rowIdx);
      row.values = [
        i + 1,
        line.name || "",
        line.qty,
        line.displayUnitPrice,
        line.dayCoef,
        line.lineTotal,
      ];
      row.getCell(4).numFmt = "#,##0";
      row.getCell(5).numFmt = "0.0";
      row.getCell(6).numFmt = "#,##0";
      rowIdx += 1;
    });

    ws.getCell(`B${rowIdx}`).value = `Итого ${section.title}:`;
    ws.getCell(`B${rowIdx}`).font = { bold: true };
    ws.getCell(`F${rowIdx}`).value = section.subtotal;
    ws.getCell(`F${rowIdx}`).numFmt = "#,##0";
    ws.getCell(`F${rowIdx}`).font = { bold: true };
    rowIdx += 1;
  }

  rowIdx += 1;
  ws.getCell(`A${rowIdx}`).value = "ИТОГО";
  ws.getCell(`A${rowIdx}`).font = { bold: true, size: 12 };
  ws.getCell(`F${rowIdx}`).value = calc.total;
  ws.getCell(`F${rowIdx}`).numFmt = '#,##0 "₽"';
  ws.getCell(`F${rowIdx}`).font = { bold: true, size: 12 };
  rowIdx += 2;

  for (const note of meta.notes) {
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    ws.getCell(`A${rowIdx}`).value = note;
    ws.getCell(`A${rowIdx}`).alignment = { wrapText: true };
    ws.getRow(rowIdx).height = 30;
    rowIdx += 1;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(
    blob,
    `${safeFilename([meta.date || todayLabel().replace(/\./g, "_"), meta.eventName || "KP"])}.xlsx`,
  );
}
