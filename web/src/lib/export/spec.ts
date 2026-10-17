import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { safeFilename, todayLabel } from "../format";
import { DEFAULT_SPEC_PRINT, type SpecPrintSettings } from "../spec-print";

function printOf(options?: SpecPrintSettings): SpecPrintSettings {
  return options ?? DEFAULT_SPEC_PRINT;
}

function headerRows(meta: SpecExportMeta, print: SpecPrintSettings): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (on: boolean, label: string, value?: string) => {
    if (on) rows.push([label, value?.trim() || "—"]);
  };
  push(print.header.title, "Мероприятие", meta.eventName);
  push(print.header.date, "Дата", meta.date);
  push(print.header.venue, "Место", meta.place);
  push(print.header.client, "Заказчик", meta.client);
  return rows;
}

function keepLine(line: SpecExportLine, print: SpecPrintSettings) {
  if (line.type !== "SECTION") return true;
  if (line.isKitHeader) return print.table.kits && print.table.subsectionHeader;
  return print.table.sectionHeader;
}

export type SpecExportMeta = {
  proposalNumber: string;
  eventName: string;
  date: string;
  place: string;
  client: string;
};

export type SpecExportLine = {
  type: "SECTION" | "ITEM";
  title: string | null;
  name: string | null;
  qty: number;
  comment?: string | null;
  kitName: string | null;
  isKitHeader?: boolean;
  hidden?: boolean;
  ownerLabel?: string | null;
};

export type SpecExportStaff = {
  name: string;
  specialtyName: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function visibleLines(lines: SpecExportLine[]) {
  return lines.filter((l) => !l.hidden);
}

function lineLabel(line: SpecExportLine) {
  if (line.type === "SECTION") return line.title || "";
  return line.name || "";
}

function filenameBase(meta: SpecExportMeta) {
  return safeFilename([
    "spec",
    meta.date || todayLabel().replace(/\./g, "_"),
    meta.eventName || meta.proposalNumber || "spec",
  ]);
}

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function exportSpecExcel(
  meta: SpecExportMeta,
  lines: SpecExportLine[],
  staff: SpecExportStaff[] = [],
  options?: SpecPrintSettings,
) {
  const print = printOf(options);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM Event Rental";
  const ws = wb.addWorksheet("Спецификация", {
    views: [{ state: "frozen", ySplit: 8 }],
  });

  ws.columns = [
    { key: "num", width: 6 },
    { key: "name", width: 48 },
    { key: "qty", width: 12 },
    { key: "owner", width: 12 },
    { key: "comment", width: 32 },
    { key: "note", width: 24 },
  ];

  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = print.header.project
    ? `Спецификация на погрузку №${meta.proposalNumber}`
    : "Спецификация на погрузку";
  ws.getCell("A1").font = {
    bold: true,
    size: print.fontSize > 0 ? print.fontSize : 14,
    name: print.fontFamily,
  };

  const fields = headerRows(meta, print);
  fields.forEach(([label, value], i) => {
    const row = 3 + i;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`B${row}`).value = value;
  });

  const headerRow = ws.getRow(8);
  headerRow.values = ["№", "Наименование", "Кол-во", "Чьё", "Комментарий", "Примечание"];
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF5" },
  };

  let rowIdx = 9;
  let itemNum = 0;

  const pushSection = (title: string, isKitHeader = false) => {
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    const cell = ws.getCell(`A${rowIdx}`);
    cell.value = title;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isKitHeader ? "FFD6E4F7" : "FFF0F4F8" },
    };
    rowIdx += 1;
  };

  const pushItem = (
    name: string,
    qty: string | number,
    note: string,
    comment = "",
    owner = "",
  ) => {
    itemNum += 1;
    const row = ws.getRow(rowIdx);
    row.values = [itemNum, name, qty, owner, comment, note];
    row.getCell(3).alignment = { horizontal: "center" };
    rowIdx += 1;
  };

  for (const line of visibleLines(lines)) {
    if (!keepLine(line, print)) continue;
    if (line.type === "SECTION") {
      pushSection(lineLabel(line), Boolean(line.isKitHeader));
      continue;
    }
    pushItem(
      lineLabel(line),
      line.qty,
      line.kitName ? `из комплекта «${line.kitName}»` : "",
      print.table.comments ? (line.comment || "").trim() : "",
      (line.ownerLabel || "").trim() === "—" ? "" : (line.ownerLabel || "").trim(),
    );
  }
  for (let i = 0; i < print.emptyRows; i += 1) pushItem("", "", "");

  if (staff.length > 0) {
    pushSection("Технический персонал");
    for (const s of staff) {
      pushItem(s.name, "", s.specialtyName || "");
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${filenameBase(meta)}.xlsx`);
}

export async function exportSpecPdf(
  meta: SpecExportMeta,
  lines: SpecExportLine[],
  staff: SpecExportStaff[] = [],
  options?: SpecPrintSettings,
) {
  const print = printOf(options);
  const [regular, bold] = await Promise.all([
    loadFontBase64("/fonts/NotoSans-Regular.ttf"),
    loadFontBase64("/fonts/NotoSans-Bold.ttf"),
  ]);

  const doc = new jsPDF({ orientation: print.orientation, unit: "mm", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", bold);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  doc.setFont("NotoSans", "normal");

  const margin = 10;
  let y = 14;

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(print.fontSize > 0 ? print.fontSize : 13);
  doc.text(
    print.header.project
      ? `Спецификация на погрузку №${meta.proposalNumber}`
      : "Спецификация на погрузку",
    margin,
    y,
  );
  y += 8;

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(print.fontSize > 0 ? Math.max(8, print.fontSize - 2) : 10);
  const info = headerRows(meta, print).map(([label, value]) => `${label}: ${value}`);
  for (const line of info) {
    doc.text(line, margin, y);
    y += 5;
  }
  y += 3;

  const tableBody: Array<
    Array<
      | string
      | { content: string; colSpan?: number; styles?: Record<string, unknown> }
    >
  > = [];

  let itemNum = 0;
  const pushSection = (title: string, isKitHeader = false) => {
    tableBody.push([
      {
        content: title,
        colSpan: 6,
        styles: {
          fontStyle: "bold",
          fillColor: isKitHeader ? [214, 228, 247] : [240, 244, 248],
        },
      },
    ]);
  };
  const pushItem = (name: string, qty: string, note: string, comment = "", owner = "") => {
    itemNum += 1;
    tableBody.push([String(itemNum), name, qty, owner, comment, note]);
  };

  for (const line of visibleLines(lines)) {
    if (!keepLine(line, print)) continue;
    if (line.type === "SECTION") {
      pushSection(lineLabel(line), Boolean(line.isKitHeader));
      continue;
    }
    pushItem(
      lineLabel(line),
      String(line.qty),
      line.kitName ? `из комплекта «${line.kitName}»` : "",
      print.table.comments ? (line.comment || "").trim() : "",
      (line.ownerLabel || "").trim() === "—" ? "" : (line.ownerLabel || "").trim(),
    );
  }
  for (let i = 0; i < print.emptyRows; i += 1) pushItem("", "", "");

  if (staff.length > 0) {
    pushSection("Технический персонал");
    for (const s of staff) {
      pushItem(s.name, "", s.specialtyName || "");
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["№", "Наименование", "Кол-во", "Чьё", "Комментарий", "Примечание"]],
    body: tableBody,
    styles: {
      font: "NotoSans",
      fontSize: print.fontSize > 0 ? print.fontSize : 8,
      cellPadding: 1.5,
      valign: "top",
    },
    headStyles: {
      font: "NotoSans",
      fontStyle: "bold",
      fillColor: [232, 238, 245],
      textColor: 20,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 52 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 16 },
      4: { cellWidth: 36 },
      5: { cellWidth: 36 },
    },
    margin: { left: margin, right: margin },
  });

  doc.save(`${filenameBase(meta)}.pdf`);
}
