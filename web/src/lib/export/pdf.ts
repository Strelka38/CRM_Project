import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatMoney,
  formatNumber,
  proposalTitle,
  safeFilename,
  todayLabel,
} from "../format";
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

function moneyPlain(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

export async function exportQuoteDocumentPdf(meta: DocMeta, calc: DocCalc) {
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
  doc.text(proposalTitle(meta.proposalNumber, todayLabel()), margin, y);
  y += 8;

  doc.setFontSize(16);
  doc.text(`Сумма  ${formatMoney(calc.total)}`, margin, y);
  y += 8;

  doc.setFont("NotoSans", "normal");
  doc.setFontSize(10);
  const info = [
    `Мероприятие: ${meta.eventName}`,
    `Дата: ${meta.date}`,
    `Время: ${meta.time}`,
    `Место: ${meta.place}`,
    `Заказчик, контактная информация: ${meta.client}`,
    `Менеджер площадки: ${meta.managerName}`,
    `Безналичный расчет: ${meta.cashless ? 1 : 0}`,
    `Продолжительность: ${meta.durationDays} день`,
  ];
  for (const line of info) {
    doc.text(line, margin, y);
    y += 5;
  }
  y += 2;

  const tableBody: Array<
    Array<
      string | { content: string; colSpan?: number; styles?: Record<string, unknown> }
    >
  > = [];

  for (const section of calc.sections) {
    if (section.items.length === 0) continue;
    tableBody.push([
      {
        content: section.title,
        colSpan: 6,
        styles: { fontStyle: "bold", fillColor: [240, 244, 248] },
      },
    ]);
    section.items.forEach((line, i) => {
      tableBody.push([
        String(i + 1),
        line.name || "",
        String(line.qty),
        moneyPlain(line.displayUnitPrice),
        formatNumber(line.dayCoef),
        moneyPlain(line.lineTotal),
      ]);
    });
    tableBody.push([
      "",
      { content: `Итого ${section.title}:`, styles: { fontStyle: "bold" } },
      "",
      "",
      "",
      { content: moneyPlain(section.subtotal), styles: { fontStyle: "bold" } },
    ]);
  }

  tableBody.push([
    { content: "ИТОГО", styles: { fontStyle: "bold" } },
    "",
    "",
    "",
    "",
    { content: moneyPlain(calc.total), styles: { fontStyle: "bold" } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["№", "Оборудование", "Кол-во", "Цена, шт.", "День коэф", "Сумма, р."]],
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
      0: { cellWidth: 8 },
      1: { cellWidth: 95 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 24, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y + 20;
  let noteY = finalY + 8;
  doc.setFont("NotoSans", "normal");
  doc.setFontSize(8);
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const note of meta.notes) {
    const lines = doc.splitTextToSize(note, 186);
    if (noteY + lines.length * 4 > pageHeight - 12) {
      doc.addPage();
      noteY = 16;
    }
    doc.text(lines, margin, noteY);
    noteY += lines.length * 4 + 2;
  }

  doc.save(
    `${safeFilename([meta.date || todayLabel().replace(/\./g, "_"), meta.eventName || "KP"])}.pdf`,
  );
}
