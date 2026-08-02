import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMoney, safeFilename, todayLabel } from "../format";
import {
  calcByZones,
  costKindOf,
  type QuoteBlockInput,
  type ZoneInput,
} from "../quote-calc";

export type ExportFilters = {
  includeSummary: boolean;
  allTabsOneSheet: boolean;
  showEquipmentPrice: boolean;
  showConsumablePrice: boolean;
  showServicePrice: boolean;
  zoneIds: string[];
};

export type ExportMeta = {
  proposalNumber: string;
  eventName: string;
  date: string;
  time: string;
  place: string;
  client: string;
  managerName: string;
  cashless: boolean;
  durationDays: number;
  discountPercent: number;
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

function filenameBase(meta: ExportMeta) {
  return safeFilename([
    meta.date || todayLabel().replace(/\./g, "_"),
    meta.eventName || "KP",
  ]);
}

function filterBlocks(
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
): QuoteBlockInput[] {
  return blocks.filter((b) => {
    if (!b.zoneId || !filters.zoneIds.includes(b.zoneId)) return false;
    if (b.type !== "ITEM") return true;
    const kind = costKindOf(b);
    if (kind === "equipment" && !filters.showEquipmentPrice) return false;
    if (kind === "consumable" && !filters.showConsumablePrice) return false;
    if (kind === "service" && !filters.showServicePrice) return false;
    return true;
  });
}

function showPriceFor(block: QuoteBlockInput, filters: ExportFilters) {
  const kind = costKindOf(block);
  if (kind === "service") return filters.showServicePrice;
  if (kind === "consumable") return filters.showConsumablePrice;
  return filters.showEquipmentPrice;
}

function hasDiscount(meta: ExportMeta) {
  return Math.max(0, Number(meta.discountPercent) || 0) > 0;
}

export function buildExportPreviewHtml(
  meta: ExportMeta,
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
): string {
  const filtered = filterBlocks(blocks, filters);
  const selectedZones = zones
    .filter((z) => filters.zoneIds.includes(z.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const summary = calcByZones(
    selectedZones,
    filtered,
    meta.cashless,
    meta.durationDays,
    meta.discountPercent,
  );

  let html = `<div style="font-family:sans-serif;padding:16px">`;
  html += `<h1>КП №${meta.proposalNumber}</h1>`;
  html += `<p>${meta.eventName || ""} · ${meta.date || ""} · ${meta.place || ""}</p>`;

  const showDisc = hasDiscount(meta);

  if (filters.includeSummary) {
    html += `<h2>Сводная</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">`;
    html += showDisc
      ? `<tr><th>Зона</th><th>Оборудование</th><th>Услуги</th><th>Итого</th><th>Скидка</th><th>К оплате</th></tr>`
      : `<tr><th>Зона</th><th>Оборудование</th><th>Услуги</th><th>Итого</th><th>К оплате</th></tr>`;
    for (const z of summary.zones) {
      html += showDisc
        ? `<tr><td>${z.name}</td><td>${formatMoney(z.equipmentTotal + z.consumablesTotal)}</td><td>${formatMoney(z.servicesTotal)}</td><td>${formatMoney(z.subtotal)}</td><td>${formatMoney(z.discount)}</td><td>${formatMoney(z.payable)}</td></tr>`
        : `<tr><td>${z.name}</td><td>${formatMoney(z.equipmentTotal + z.consumablesTotal)}</td><td>${formatMoney(z.servicesTotal)}</td><td>${formatMoney(z.subtotal)}</td><td>${formatMoney(z.payable)}</td></tr>`;
    }
    html += showDisc
      ? `<tr><td><b>Итого</b></td><td><b>${formatMoney(summary.equipmentTotal + summary.consumablesTotal)}</b></td><td><b>${formatMoney(summary.servicesTotal)}</b></td><td><b>${formatMoney(summary.subtotal)}</b></td><td><b>${formatMoney(summary.discount)}</b></td><td><b>${formatMoney(summary.payable)}</b></td></tr></table>`
      : `<tr><td><b>Итого</b></td><td><b>${formatMoney(summary.equipmentTotal + summary.consumablesTotal)}</b></td><td><b>${formatMoney(summary.servicesTotal)}</b></td><td><b>${formatMoney(summary.subtotal)}</b></td><td><b>${formatMoney(summary.payable)}</b></td></tr></table>`;
  }

  for (const z of summary.zones) {
    html += `<h2>${z.name}</h2>`;
    html += `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">`;
    html += `<tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>`;
    let n = 0;
    for (const section of z.doc.sections) {
      html += `<tr><td colspan="5"><b>${section.title}</b></td></tr>`;
      for (const item of section.items) {
        n += 1;
        const price = showPriceFor(item, filters)
          ? formatMoney(item.displayUnitPrice)
          : "—";
        const sum = showPriceFor(item, filters)
          ? formatMoney(item.lineTotal)
          : "—";
        html += `<tr><td>${n}</td><td>${item.name || ""}</td><td>${item.qty}</td><td>${price}</td><td>${sum}</td></tr>`;
      }
    }
    html += `</table>`;
    html += `<p>ИТОГО — АРЕНДА: ${formatMoney(z.equipmentTotal + z.consumablesTotal)} · УСЛУГИ: ${formatMoney(z.servicesTotal)} · К ОПЛАТЕ: ${formatMoney(z.payable)}</p>`;
  }

  html += `</div>`;
  return html;
}

export async function exportQuoteZonesExcel(
  meta: ExportMeta,
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
) {
  const filtered = filterBlocks(blocks, filters);
  const selectedZones = zones
    .filter((z) => filters.zoneIds.includes(z.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const summary = calcByZones(
    selectedZones,
    filtered,
    meta.cashless,
    meta.durationDays,
    meta.discountPercent,
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM Event Rental";
  const showDisc = hasDiscount(meta);

  if (filters.includeSummary) {
    const ws = wb.addWorksheet("Сводная");
    ws.columns = showDisc
      ? [
          { width: 6 },
          { width: 36 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 22 },
          { width: 14 },
        ]
      : [
          { width: 6 },
          { width: 36 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
          { width: 14 },
        ];
    ws.getCell("A1").value = `КП №${meta.proposalNumber}`;
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A2").value = meta.eventName;
    ws.getCell("A3").value = `Создан: ${meta.date || todayLabel()}`;

    const header = ws.getRow(5);
    header.values = showDisc
      ? ["№", "Зона", "Оборудование", "Услуги", "Итого", "Скидка", "К оплате"]
      : ["№", "Зона", "Оборудование", "Услуги", "Итого", "К оплате"];
    header.font = { bold: true };

    let r = 6;
    summary.zones.forEach((z, i) => {
      ws.getRow(r).values = showDisc
        ? [
            i + 1,
            z.name,
            z.equipmentTotal + z.consumablesTotal,
            z.servicesTotal,
            z.subtotal,
            `Скидка ${meta.discountPercent}% ${Math.round(z.discount)}`,
            z.payable,
          ]
        : [
            i + 1,
            z.name,
            z.equipmentTotal + z.consumablesTotal,
            z.servicesTotal,
            z.subtotal,
            z.payable,
          ];
      for (const c of showDisc ? [3, 4, 5, 7] : [3, 4, 5, 6]) {
        ws.getRow(r).getCell(c).numFmt = "#,##0";
      }
      r += 1;
    });
    ws.getRow(r).values = showDisc
      ? [
          "",
          "Итого:",
          summary.equipmentTotal + summary.consumablesTotal,
          summary.servicesTotal,
          summary.subtotal,
          summary.discount,
          summary.payable,
        ]
      : [
          "",
          "Итого:",
          summary.equipmentTotal + summary.consumablesTotal,
          summary.servicesTotal,
          summary.subtotal,
          summary.payable,
        ];
    ws.getRow(r).font = { bold: true };
  }

  const writeZoneSheet = (ws: ExcelJS.Worksheet, zoneName: string, zoneId: string) => {
    const z = summary.zones.find((x) => x.zoneId === zoneId);
    if (!z) return;
    let r = 1;
    ws.getCell(`A${r}`).value = zoneName;
    ws.getCell(`A${r}`).font = { bold: true, size: 14 };
    r += 2;
    ws.getRow(r).values = ["№", "Оборудование / Услуги", "Кол-во", "Цена", "Сумма"];
    ws.getRow(r).font = { bold: true };
    r += 1;
    let n = 0;
    let rent = 0;
    let services = 0;
    for (const section of z.doc.sections) {
      ws.mergeCells(`A${r}:E${r}`);
      ws.getCell(`A${r}`).value = section.title;
      ws.getCell(`A${r}`).font = { bold: true };
      r += 1;
      for (const item of section.items) {
        n += 1;
        const withPrice = showPriceFor(item, filters);
        ws.getRow(r).values = [
          n,
          item.name || "",
          item.qty,
          withPrice ? item.displayUnitPrice : null,
          withPrice ? item.lineTotal : null,
        ];
        if (withPrice) {
          ws.getRow(r).getCell(4).numFmt = "#,##0.00";
          ws.getRow(r).getCell(5).numFmt = "#,##0.00";
        }
        const kind = costKindOf(item);
        if (kind === "service") services += item.lineTotal;
        else rent += item.lineTotal;
        r += 1;
      }
    }
    r += 1;
    ws.getCell(`A${r}`).value = "ИТОГО — АРЕНДА";
    ws.getCell(`E${r}`).value = rent;
    ws.getCell(`E${r}`).numFmt = "#,##0.00";
    r += 1;
    ws.getCell(`A${r}`).value = "ИТОГО — УСЛУГИ";
    ws.getCell(`E${r}`).value = services;
    ws.getCell(`E${r}`).numFmt = "#,##0.00";
    r += 1;
    ws.getCell(`A${r}`).value = "ИТОГО";
    ws.getCell(`E${r}`).value = z.subtotal;
    ws.getCell(`E${r}`).font = { bold: true };
    r += 1;
    if (showDisc) {
      ws.getCell(`A${r}`).value = `Скидка ${meta.discountPercent}%`;
      ws.getCell(`E${r}`).value = z.discount;
      r += 1;
    }
    ws.getCell(`A${r}`).value = "К ОПЛАТЕ";
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`E${r}`).value = z.payable;
    ws.getCell(`E${r}`).font = { bold: true };
    ws.getColumn(2).width = 60;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 14;
  };

  if (filters.allTabsOneSheet) {
    const ws = wb.addWorksheet("Смета");
    ws.getColumn(2).width = 60;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 14;
    let r = 1;
    for (const z of selectedZones) {
      const zoneCalc = summary.zones.find((x) => x.zoneId === z.id);
      if (!zoneCalc) continue;
      ws.getCell(`A${r}`).value = z.name;
      ws.getCell(`A${r}`).font = { bold: true, size: 14 };
      r += 2;
      ws.getRow(r).values = [
        "№",
        "Оборудование / Услуги",
        "Кол-во",
        "Цена",
        "Сумма",
      ];
      ws.getRow(r).font = { bold: true };
      r += 1;
      let n = 0;
      for (const section of zoneCalc.doc.sections) {
        ws.mergeCells(`A${r}:E${r}`);
        ws.getCell(`A${r}`).value = section.title;
        ws.getCell(`A${r}`).font = { bold: true };
        r += 1;
        for (const item of section.items) {
          n += 1;
          const withPrice = showPriceFor(item, filters);
          ws.getRow(r).values = [
            n,
            item.name || "",
            item.qty,
            withPrice ? item.displayUnitPrice : null,
            withPrice ? item.lineTotal : null,
          ];
          r += 1;
        }
      }
      ws.getCell(`A${r}`).value = `К ОПЛАТЕ: ${Math.round(zoneCalc.payable)}`;
      ws.getCell(`A${r}`).font = { bold: true };
      r += 3;
    }
  } else {
    for (const z of selectedZones) {
      const name = z.name.slice(0, 28) || "Зона";
      const ws = wb.addWorksheet(name);
      writeZoneSheet(ws, z.name, z.id);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${filenameBase(meta)}.xlsx`,
  );
}

export async function exportQuoteZonesPdf(
  meta: ExportMeta,
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
) {
  const filtered = filterBlocks(blocks, filters);
  const selectedZones = zones
    .filter((z) => filters.zoneIds.includes(z.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const summary = calcByZones(
    selectedZones,
    filtered,
    meta.cashless,
    meta.durationDays,
    meta.discountPercent,
  );

  const [regular, bold] = await Promise.all([
    loadFontBase64("/fonts/NotoSans-Regular.ttf"),
    loadFontBase64("/fonts/NotoSans-Bold.ttf"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", bold);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");

  const margin = 12;
  let first = true;
  const showDisc = hasDiscount(meta);

  const ensurePage = () => {
    if (!first) doc.addPage();
    first = false;
  };

  if (filters.includeSummary) {
    ensurePage();
    let y = 14;
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(13);
    doc.text(`КП №${meta.proposalNumber} — Сводная`, margin, y);
    y += 7;
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(10);
    doc.text(
      `${meta.eventName || "—"} · ${meta.date || "—"} · ${meta.place || "—"}`,
      margin,
      y,
    );
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [
        showDisc
          ? ["№", "Зона", "Оборудование", "Услуги", "Итого", "Скидка", "К оплате"]
          : ["№", "Зона", "Оборудование", "Услуги", "Итого", "К оплате"],
      ],
      body: [
        ...summary.zones.map((z, i) =>
          showDisc
            ? [
                String(i + 1),
                z.name,
                moneyPlain(z.equipmentTotal + z.consumablesTotal),
                moneyPlain(z.servicesTotal),
                moneyPlain(z.subtotal),
                moneyPlain(z.discount),
                moneyPlain(z.payable),
              ]
            : [
                String(i + 1),
                z.name,
                moneyPlain(z.equipmentTotal + z.consumablesTotal),
                moneyPlain(z.servicesTotal),
                moneyPlain(z.subtotal),
                moneyPlain(z.payable),
              ],
        ),
        showDisc
          ? [
              "",
              "Итого",
              moneyPlain(summary.equipmentTotal + summary.consumablesTotal),
              moneyPlain(summary.servicesTotal),
              moneyPlain(summary.subtotal),
              moneyPlain(summary.discount),
              moneyPlain(summary.payable),
            ]
          : [
              "",
              "Итого",
              moneyPlain(summary.equipmentTotal + summary.consumablesTotal),
              moneyPlain(summary.servicesTotal),
              moneyPlain(summary.subtotal),
              moneyPlain(summary.payable),
            ],
      ],
      styles: { font: "NotoSans", fontSize: 8, cellPadding: 1.5 },
      headStyles: {
        font: "NotoSans",
        fontStyle: "bold",
        fillColor: [232, 238, 245],
        textColor: 20,
      },
      margin: { left: margin, right: margin },
    });
  }

  for (const z of summary.zones) {
    ensurePage();
    let y = 14;
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(14);
    doc.text(z.name, margin, y);
    y += 8;

    const body: Array<
      Array<
        | string
        | { content: string; colSpan?: number; styles?: Record<string, unknown> }
      >
    > = [];
    let n = 0;
    for (const section of z.doc.sections) {
      body.push([
        {
          content: section.title,
          colSpan: 5,
          styles: { fontStyle: "bold", fillColor: [240, 244, 248] },
        },
      ]);
      for (const item of section.items) {
        n += 1;
        const withPrice = showPriceFor(item, filters);
        body.push([
          String(n),
          item.name || "",
          String(item.qty ?? 0),
          withPrice ? moneyPlain(item.displayUnitPrice) : "—",
          withPrice ? moneyPlain(item.lineTotal) : "—",
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [["№", "Оборудование / Услуги", "Кол-во", "Цена", "Сумма"]],
      body,
      styles: { font: "NotoSans", fontSize: 8, cellPadding: 1.5 },
      headStyles: {
        font: "NotoSans",
        fontStyle: "bold",
        fillColor: [232, 238, 245],
        textColor: 20,
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 100 },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });

    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y + 20;
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9);
    let ty = finalY + 8;
    doc.text(
      `ИТОГО — АРЕНДА: ${moneyPlain(z.equipmentTotal + z.consumablesTotal)}`,
      margin,
      ty,
    );
    ty += 5;
    doc.text(`ИТОГО — УСЛУГИ: ${moneyPlain(z.servicesTotal)}`, margin, ty);
    ty += 5;
    doc.setFont("NotoSans", "bold");
    if (showDisc) {
      doc.text(
        `Скидка ${meta.discountPercent}%: ${moneyPlain(z.discount)}`,
        margin,
        ty,
      );
      ty += 5;
    }
    doc.text(`К ОПЛАТЕ: ${moneyPlain(z.payable)}`, margin, ty);
  }

  doc.save(`${filenameBase(meta)}.pdf`);
}
