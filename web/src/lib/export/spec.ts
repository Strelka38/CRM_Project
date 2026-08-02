import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { safeFilename, todayLabel } from "../format";

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
  kitName: string | null;
  isKitHeader?: boolean;
  hidden?: boolean;
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
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM Event Rental";
  const ws = wb.addWorksheet("Спецификация", {
    views: [{ state: "frozen", ySplit: 8 }],
  });

  ws.columns = [
    { key: "num", width: 6 },
    { key: "name", width: 72 },
    { key: "qty", width: 12 },
    { key: "note", width: 28 },
  ];

  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = `Спецификация на погрузку №${meta.proposalNumber}`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  const fields: [string, string][] = [
    ["Мероприятие", meta.eventName || "—"],
    ["Дата", meta.date || "—"],
    ["Место", meta.place || "—"],
    ["Заказчик", meta.client || "—"],
  ];
  fields.forEach(([label, value], i) => {
    const row = 3 + i;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`B${row}`).value = value;
  });

  const headerRow = ws.getRow(8);
  headerRow.values = ["№", "Наименование", "Кол-во", "Примечание"];
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF5" },
  };

  let rowIdx = 9;
  let itemNum = 0;
  for (const line of visibleLines(lines)) {
    const isSection = line.type === "SECTION";
    if (isSection) {
      ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
      const cell = ws.getCell(`A${rowIdx}`);
      cell.value = lineLabel(line);
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: line.isKitHeader ? "FFD6E4F7" : "FFF0F4F8" },
      };
      rowIdx += 1;
      continue;
    }

    itemNum += 1;
    const row = ws.getRow(rowIdx);
    row.values = [
      itemNum,
      lineLabel(line),
      line.qty,
      line.kitName ? `из комплекта: ${line.kitName}` : "",
    ];
    row.getCell(3).alignment = { horizontal: "center" };
    rowIdx += 1;
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
) {
  const [regular, bold] = await Promise.all([
    loadFontBase64("/fonts/NotoSans-Regular.ttf"),
    loadFontBase64("/fonts/NotoSans-Bold.ttf"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", bold);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  doc.setFont("NotoSans", "normal");

  const margin = 12;
  let y = 14;

  doc.setFont("NotoSans", "bold");
  doc.setFontSize(13);
  doc.text(`Спецификация на погрузку №${meta.proposalNumber}`, margin, y);
  y += 8;

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(10);
  const info = [
    `Мероприятие: ${meta.eventName || "—"}`,
    `Дата: ${meta.date || "—"}`,
    `Место: ${meta.place || "—"}`,
    `Заказчик: ${meta.client || "—"}`,
  ];
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
  for (const line of visibleLines(lines)) {
    if (line.type === "SECTION") {
      tableBody.push([
        {
          content: lineLabel(line),
          colSpan: 4,
          styles: {
            fontStyle: "bold",
            fillColor: line.isKitHeader ? [214, 228, 247] : [240, 244, 248],
          },
        },
      ]);
      continue;
    }
    itemNum += 1;
    tableBody.push([
      String(itemNum),
      lineLabel(line),
      String(line.qty),
      line.kitName ? `из комплекта: ${line.kitName}` : "",
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [["№", "Наименование", "Кол-во", "Примечание"]],
    body: tableBody,
    styles: {
      font: "NotoSans",
      fontSize: 8,
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
      1: { cellWidth: 110 },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 48 },
    },
    margin: { left: margin, right: margin },
  });

  doc.save(`${filenameBase(meta)}.pdf`);
}
