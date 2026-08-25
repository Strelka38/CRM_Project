import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMoney, safeFilename, todayLabel } from "../format";
import {
  calcByZones,
  costKindOf,
  type CalcBlock,
  type QuoteBlockInput,
  type ZoneInput,
  type ZoneTotals,
} from "../quote-calc";
import {
  ESTIMATE_COLORS,
  ESTIMATE_DISCLAIMER,
  formatEstimateNumber,
  partitionByKind,
  remainingPageMm,
  shouldStartNewPage,
} from "./estimate-layout";
import {
  BRAND_NAME,
  BRAND_SITE,
  buildKpHeader,
  loadPrintBrandMark,
} from "./kp-header";
import { loadSansFonts, registerPdfFont } from "./pdf-fonts";

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
  clientId?: string | null;
  ownerId?: string | null;
  /** Поле «Контактная информация» в карточке КП. */
  requestContact?: string;
  managerName: string;
  managerPhone?: string;
  cashless: boolean;
  cashlessPercent?: number;
  durationDays: number;
  discountPercent: number;
  notes: string[];
};

const ZONE_COLS = 5;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cashlessRate(meta: ExportMeta) {
  const n = Number(meta.cashlessPercent);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function filenameBase(meta: ExportMeta) {
  return safeFilename([
    meta.date || todayLabel().replace(/\./g, "_"),
    meta.eventName || "KP",
  ]);
}

function filterBlocks(blocks: QuoteBlockInput[], filters: ExportFilters) {
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

function itemUnit(item: CalcBlock, cashless: boolean) {
  const qty = Number(item.qty) || 0;
  const coef = Number(item.dayCoef) || 1;
  if (cashless && qty > 0 && coef > 0) return item.lineTotalCash / (qty * coef);
  return item.displayUnitPrice;
}

function itemSum(item: CalcBlock, cashless: boolean) {
  return cashless ? item.lineTotalCash : item.lineTotal;
}

function zoneCash(z: ZoneTotals) {
  let rental = 0;
  let services = 0;
  for (const section of z.doc.sections) {
    for (const item of section.items) {
      if (costKindOf(item) === "service") services += item.lineTotalCash;
      else rental += item.lineTotalCash;
    }
  }
  return { rental, services, total: rental + services };
}

function prepare(
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
    meta.cashlessPercent,
  );
  return { selectedZones, summary };
}

function moneyAlign(colIndex: number): "left" | "center" | "right" {
  if (colIndex === 1) return "left";
  if (colIndex === 2) return "center";
  return colIndex >= 3 ? "right" : "center";
}

const HAIRLINE = { style: "thin" as const, color: { argb: ESTIMATE_COLORS.lineArgb } };

function paint(
  cell: ExcelJS.Cell,
  opts: {
    fill?: string;
    bold?: boolean;
    size?: number;
    align?: "left" | "center" | "right";
    color?: string;
  } = {},
) {
  cell.font = {
    name: "Calibri",
    size: opts.size ?? 9,
    bold: Boolean(opts.bold),
    color: { argb: opts.color ?? ESTIMATE_COLORS.inkArgb },
  };
  cell.border = { bottom: HAIRLINE };
  cell.alignment = {
    horizontal: opts.align ?? "left",
    vertical: "middle",
    wrapText: true,
  };
  if (opts.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: opts.fill },
    };
  }
}

function landscape(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
}

function writeExcelKpHeader(
  ws: ExcelJS.Worksheet,
  meta: ExportMeta,
  lastCol: number,
) {
  const header = buildKpHeader(meta);
  ws.mergeCells(1, 1, 2, Math.max(2, lastCol - 2));
  const title = ws.getCell(1, 1);
  title.value = header.title;
  paint(title, { bold: true, size: 16 });
  title.border = {};

  header.rows.forEach((row, i) => {
    const r = 3 + i;
    ws.getCell(r, 1).value = `${row.label}:`;
    paint(ws.getCell(r, 1), { color: ESTIMATE_COLORS.mutedArgb, size: 9 });
    ws.getCell(r, 1).border = {};
    ws.mergeCells(r, 2, r, Math.max(2, lastCol - 2));
    ws.getCell(r, 2).value = row.value;
    paint(ws.getCell(r, 2), { size: 9 });
    ws.getCell(r, 2).border = {};
  });

  const brandStart = Math.max(1, lastCol - 1);
  ws.mergeCells(1, brandStart, 1, lastCol);
  ws.getCell(1, brandStart).value = BRAND_NAME;
  paint(ws.getCell(1, brandStart), { bold: true, size: 11, align: "right" });
  ws.getCell(1, brandStart).border = {};
  ws.mergeCells(2, brandStart, 2, lastCol);
  ws.getCell(2, brandStart).value = BRAND_SITE;
  paint(ws.getCell(2, brandStart), {
    size: 9,
    align: "right",
    color: ESTIMATE_COLORS.mutedArgb,
  });
  ws.getCell(2, brandStart).border = {};
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 16;
  return 3 + header.rows.length + 1;
}

function writeHeaderRow(ws: ExcelJS.Worksheet, row: number, nameTitle: string) {
  ["№", nameTitle, "Кол-во", "Цена", "Сумма"].forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    paint(cell, {
      fill: ESTIMATE_COLORS.headerArgb,
      bold: true,
      align: i === 1 ? "left" : moneyAlign(i),
      color: ESTIMATE_COLORS.mutedArgb,
      size: 8,
    });
  });
}

function writeBand(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  fill: string,
  size: number,
) {
  ws.mergeCells(row, 1, row, ZONE_COLS);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  paint(cell, { fill, bold: true, size });
  for (let c = 2; c <= ZONE_COLS; c += 1) paint(ws.getCell(row, c), { fill });
}

function writeTotal(
  ws: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: number,
  bold = false,
) {
  ws.mergeCells(row, 1, row, ZONE_COLS - 1);
  paint(ws.getCell(row, 1), {
    bold,
    align: "right",
    fill: ESTIMATE_COLORS.totalArgb,
  });
  ws.getCell(row, 1).value = label;
  for (let c = 2; c <= ZONE_COLS - 1; c += 1) {
    paint(ws.getCell(row, c), { fill: ESTIMATE_COLORS.totalArgb });
  }
  const sum = ws.getCell(row, ZONE_COLS);
  sum.value = value;
  sum.numFmt = "#,##0.00";
  paint(sum, { bold, align: "right", fill: ESTIMATE_COLORS.totalArgb });
}

function appendZoneExcel(
  ws: ExcelJS.Worksheet,
  z: ZoneTotals,
  meta: ExportMeta,
  filters: ExportFilters,
  startRow: number,
) {
  let r = startRow;
  const cashless = meta.cashless;
  const cash = zoneCash(z);
  writeBand(ws, r, z.name.toUpperCase(), ESTIMATE_COLORS.zoneArgb, 12);
  r += 1;

  const writeGroup = (
    sections: Array<{ title: string; items: CalcBlock[] }>,
    nameTitle: string,
  ) => {
    for (const section of sections) {
      writeBand(ws, r, section.title, ESTIMATE_COLORS.categoryArgb, 10);
      r += 1;
      writeHeaderRow(ws, r, nameTitle);
      r += 1;
      section.items.forEach((item, idx) => {
        const priced = showPriceFor(item, filters);
        const values: Array<string | number | null> = [
          idx + 1,
          item.name || "",
          item.qty ?? 0,
          priced ? itemUnit(item, cashless) : null,
          priced ? itemSum(item, cashless) : null,
        ];
        values.forEach((v, i) => {
          const cell = ws.getCell(r, i + 1);
          cell.value = v;
          paint(cell, { align: moneyAlign(i) });
          if (i >= 3 && typeof v === "number") cell.numFmt = "#,##0.00";
        });
        r += 1;
      });
      const sub = section.items.reduce(
        (s, item) => s + (showPriceFor(item, filters) ? itemSum(item, cashless) : 0),
        0,
      );
      writeTotal(ws, r, `Итого ${section.title}:`, sub);
      r += 1;
    }
  };

  const rentalSections = z.doc.sections
    .map((section) => ({
      title: section.title,
      items: partitionByKind(section.items, costKindOf).rental,
    }))
    .filter((s) => s.items.length > 0);
  const serviceSections = z.doc.sections
    .map((section) => ({
      title: section.title,
      items: partitionByKind(section.items, costKindOf).services,
    }))
    .filter((s) => s.items.length > 0);

  if (rentalSections.length) writeGroup(rentalSections, "Оборудование");
  writeTotal(
    ws,
    r,
    "ИТОГО — АРЕНДА:",
    cashless ? cash.rental : z.equipmentTotal + z.consumablesTotal,
    true,
  );
  r += 1;
  if (serviceSections.length) writeGroup(serviceSections, "Услуги");
  writeTotal(
    ws,
    r,
    "ИТОГО — УСЛУГИ:",
    cashless ? cash.services : z.servicesTotal,
    true,
  );
  r += 1;
  writeTotal(ws, r, "ИТОГО:", cashless ? cash.total : z.subtotal, true);
  r += 1;
  if (cashless) {
    writeTotal(
      ws,
      r,
      `Налоги, банк ${cashlessRate(meta).toFixed(2)}%:`,
      z.subtotal - cash.total,
    );
    r += 1;
  }
  if (hasDiscount(meta)) {
    writeTotal(ws, r, `Скидка ${meta.discountPercent}%:`, z.discount);
    r += 1;
  }
  writeTotal(ws, r, "К ОПЛАТЕ:", z.payable, true);
  return r + 2;
}

function writeExcelDisclaimer(ws: ExcelJS.Worksheet, row: number) {
  ws.mergeCells(row, 1, row, ZONE_COLS);
  const note = ws.getCell(row, 1);
  note.value = ESTIMATE_DISCLAIMER;
  note.font = {
    name: "Calibri",
    size: 8,
    italic: true,
    color: { argb: ESTIMATE_COLORS.mutedArgb },
  };
  note.alignment = { wrapText: true, vertical: "top" };
  note.border = {};
  ws.getRow(row).height = 48;
  return row + 1;
}

function previewCss() {
  return `
    body{margin:0;background:#e8eef5;color:#0f1729;font:13px/1.4 Calibri,Arial,sans-serif}
    .sheet{max-width:1100px;margin:16px auto;padding:20px 24px;background:#fff}
    .head{display:flex;justify-content:space-between;gap:24px;margin-bottom:18px}
    .meta{flex:1;min-width:0}
    .title{margin:0 0 10px;font-size:22px;font-weight:700}
    .row{display:flex;gap:8px;margin:3px 0;font-size:13px}
    .lbl{color:#5a6b82;min-width:140px}
    .brand{text-align:right;flex:0 0 180px}
    .brand img{width:56px;height:56px;object-fit:contain;display:block;margin:0 0 6px auto;filter:invert(1)}
    .brand strong{display:block}
    .brand a{color:#5a6b82;text-decoration:none;font-size:12px}
    table{width:100%;border-collapse:collapse;margin:0 0 14px}
    th{background:#eef3f8;color:#5a6b82;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid #d0d9e6}
    td{padding:5px 8px;border-bottom:1px solid rgba(208,217,230,.72);vertical-align:middle}
    .num,.qty{text-align:center}
    .money{text-align:right;font-variant-numeric:tabular-nums}
    .zone{background:#ebf7fc;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    .section{background:#d6eef9;font-weight:700}
    .total td{background:#f0f9fd;font-weight:600;border-top:2px solid rgba(15,23,41,.2);border-bottom:0;text-align:right}
    .note{font-size:11px;color:#5a6b82}
  `;
}

export function buildExportPreviewHtml(
  meta: ExportMeta,
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
  logoDataUrl?: string | null,
): string {
  const { summary } = prepare(meta, zones, blocks, filters);
  const cashless = meta.cashless;
  const header = buildKpHeader(meta);
  let html = `<!doctype html><html><head><meta charset="utf-8"><style>${previewCss()}</style></head><body><div class="sheet">`;
  html += `<div class="head"><div class="meta">`;
  html += `<h1 class="title">${escapeHtml(header.title)}</h1>`;
  for (const row of header.rows) {
    html += `<div class="row"><span class="lbl">${escapeHtml(row.label)}:</span><span>${escapeHtml(row.value)}</span></div>`;
  }
  html += `</div>`;
  html += `<div class="brand">`;
  html += `<img src="${logoDataUrl || "/brand/bsg-logo.png"}" alt="">`;
  html += `<strong>${BRAND_NAME}</strong><div><a href="https://${BRAND_SITE}">${BRAND_SITE}</a></div></div></div>`;

  if (filters.includeSummary) {
    html += `<table><thead><tr><th class="num">№</th><th>Коммерческое предложение</th><th class="money">Оборудование</th><th class="money">Услуги</th><th class="money">Итого</th>`;
    if (cashless) html += `<th class="money">Налог</th>`;
    html += `<th class="money">К оплате</th></tr></thead><tbody>`;
    summary.zones.forEach((z, i) => {
      const cash = zoneCash(z);
      const rental = cashless ? cash.rental : z.equipmentTotal + z.consumablesTotal;
      const services = cashless ? cash.services : z.servicesTotal;
      const sub = cashless ? cash.total : z.subtotal;
      html += `<tr><td class="num">${i + 1}</td><td>${escapeHtml(z.name)}</td><td class="money">${formatMoney(rental)}</td><td class="money">${formatMoney(services)}</td><td class="money">${formatMoney(sub)}</td>`;
      if (cashless) {
        html += `<td class="money">${formatEstimateNumber(z.subtotal - cash.total)}</td>`;
      }
      html += `<td class="money">${formatMoney(z.payable)}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  for (const z of summary.zones) {
    html += `<table><tbody><tr class="zone"><td colspan="5">${escapeHtml(z.name)}</td></tr></tbody></table>`;
    for (const pick of ["rental", "services"] as const) {
      const label = pick === "rental" ? "Оборудование" : "Услуги";
      for (const section of z.doc.sections) {
        const items = partitionByKind(section.items, costKindOf)[pick];
        if (!items.length) continue;
        html += `<table><thead><tr class="section"><th colspan="5">${escapeHtml(section.title)}</th></tr>`;
        html += `<tr><th class="num">№</th><th>${label}</th><th class="qty">Кол-во</th><th class="money">Цена</th><th class="money">Сумма</th></tr></thead><tbody>`;
        items.forEach((item, idx) => {
          const priced = showPriceFor(item, filters);
          html += `<tr><td class="num">${idx + 1}</td><td>${escapeHtml(item.name || "")}</td><td class="qty">${item.qty ?? 0}</td><td class="money">${priced ? formatMoney(itemUnit(item, cashless)) : "—"}</td><td class="money">${priced ? formatMoney(itemSum(item, cashless)) : "—"}</td></tr>`;
        });
        html += `</tbody></table>`;
      }
    }
    html += `<table><tr class="total"><td colspan="4">К ОПЛАТЕ</td><td class="money">${formatMoney(z.payable)}</td></tr></table>`;
  }
  html += `<p class="note">${escapeHtml(ESTIMATE_DISCLAIMER)}</p></div></body></html>`;
  return html;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportQuoteZonesExcel(
  meta: ExportMeta,
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
  opts?: { download?: boolean },
) {
  const { selectedZones, summary } = prepare(meta, zones, blocks, filters);
  const wb = new ExcelJS.Workbook();
  wb.creator = "BaikalStageGroup CRM";
  const cashless = meta.cashless;

  if (filters.includeSummary) {
    const ws = wb.addWorksheet("Общая информация");
    landscape(ws);
    const colCount = cashless ? 7 : 6;
    ws.columns = [
      { width: 8 },
      { width: 36 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: cashless ? 28 : 16 },
      ...(cashless ? [{ width: 16 }] : []),
    ];
    let r = writeExcelKpHeader(ws, meta, colCount);
    const headers = cashless
      ? ["№", "Коммерческое предложение", "Оборудование", "Услуги", "Итого", "Налог", "К оплате"]
      : ["№", "Коммерческое предложение", "Оборудование", "Услуги", "Итого", "К оплате"];
    headers.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      paint(cell, {
        fill: ESTIMATE_COLORS.headerArgb,
        bold: true,
        align: i <= 1 ? (i === 1 ? "left" : "center") : "right",
        color: ESTIMATE_COLORS.mutedArgb,
        size: 8,
      });
    });
    r += 1;
    summary.zones.forEach((z, i) => {
      const cash = zoneCash(z);
      const row = cashless
        ? [
            i + 1,
            z.name,
            cash.rental,
            cash.services,
            cash.total,
            z.subtotal - cash.total,
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
      row.forEach((v, c) => {
        const cell = ws.getCell(r, c + 1);
        cell.value = v;
        paint(cell, { align: c === 1 ? "left" : c === 0 ? "center" : "right" });
        if (typeof v === "number" && c > 0) cell.numFmt = "#,##0.00";
      });
      r += 1;
    });
    const rentalSum = summary.zones.reduce((s, z) => s + zoneCash(z).rental, 0);
    const serviceSum = summary.zones.reduce((s, z) => s + zoneCash(z).services, 0);
    const totalRow = cashless
      ? ["", "Итого:", rentalSum, serviceSum, rentalSum + serviceSum, "", summary.payable]
      : [
          "",
          "Итого:",
          summary.equipmentTotal + summary.consumablesTotal,
          summary.servicesTotal,
          summary.subtotal,
          summary.payable,
        ];
    totalRow.forEach((v, c) => {
      const cell = ws.getCell(r, c + 1);
      cell.value = v;
      paint(cell, {
        bold: true,
        align: "right",
        fill: ESTIMATE_COLORS.totalArgb,
      });
      if (typeof v === "number") cell.numFmt = "#,##0.00";
    });
  }

  const zoneCols = [
    { width: 6 },
    { width: 56 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
  ];

  if (filters.allTabsOneSheet) {
    const ws = wb.addWorksheet("Все вкладки на одном листе");
    ws.columns = zoneCols;
    landscape(ws);
    let r = writeExcelKpHeader(ws, meta, ZONE_COLS);
    for (const z of selectedZones) {
      const zoneCalc = summary.zones.find((x) => x.zoneId === z.id);
      if (!zoneCalc) continue;
      r = appendZoneExcel(ws, zoneCalc, meta, filters, r);
    }
    writeExcelDisclaimer(ws, r);
  } else {
    for (const z of selectedZones) {
      const zoneCalc = summary.zones.find((x) => x.zoneId === z.id);
      if (!zoneCalc) continue;
      const ws = wb.addWorksheet(z.name.slice(0, 28) || "Зона");
      ws.columns = zoneCols;
      landscape(ws);
      const start = writeExcelKpHeader(ws, meta, ZONE_COLS);
      const end = appendZoneExcel(ws, zoneCalc, meta, filters, start);
      writeExcelDisclaimer(ws, end);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${filenameBase(meta)}.xlsx`;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (opts?.download !== false) downloadBlob(blob, filename);
  return { blob, filename };
}

type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function drawBottomRule(
  doc: jsPDF,
  data: { cell: { x: number; y: number; width: number; height: number }; section: string },
) {
  if (data.section !== "head" && data.section !== "body") return;
  doc.setDrawColor(...ESTIMATE_COLORS.line);
  doc.setLineWidth(0.18);
  const { x, y, width, height } = data.cell;
  doc.line(x, y + height, x + width, y + height);
}

export async function exportQuoteZonesPdf(
  meta: ExportMeta,
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  filters: ExportFilters,
  opts?: { download?: boolean },
) {
  const { summary } = prepare(meta, zones, blocks, filters);
  const fonts = await loadSansFonts();
  const logo = await loadPrintBrandMark();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const font = registerPdfFont(doc, fonts);
  const margin = 12;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const bottom = 12;
  const cashless = meta.cashless;
  const showDisc = hasDiscount(meta);
  const innerW = pageW - margin * 2;

  const drawBrand = (compact: boolean) => {
    const logoSize = compact ? 7 : 14;
    const x = pageW - margin;
    const y = compact ? 3 : 8;
    if (logo) {
      try {
        doc.addImage(logo, "PNG", x - logoSize, y, logoSize, logoSize);
      } catch {
        /* ignore */
      }
    }
    doc.setFont(font, "bold");
    doc.setFontSize(compact ? 7.5 : 9);
    doc.setTextColor(...ESTIMATE_COLORS.ink);
    const textY = y + logoSize + (compact ? 2.8 : 4);
    doc.text(BRAND_NAME, x, textY, { align: "right" });
    doc.setFont(font, "normal");
    doc.setFontSize(compact ? 6.5 : 7.5);
    doc.setTextColor(...ESTIMATE_COLORS.muted);
    doc.text(BRAND_SITE, x, textY + (compact ? 3.2 : 4), { align: "right" });
    doc.setTextColor(...ESTIMATE_COLORS.ink);
  };

  const drawFullHeader = () => {
    const header = buildKpHeader(meta);
    drawBrand(false);
    const leftW = innerW - 52;
    let y = 14;
    doc.setFont(font, "bold");
    doc.setFontSize(14);
    doc.setTextColor(...ESTIMATE_COLORS.ink);
    const titleLines = doc.splitTextToSize(header.title, leftW) as string[];
    doc.text(titleLines, margin, y);
    y += titleLines.length * 5.5 + 3;
    doc.setFontSize(9);
    for (const row of header.rows) {
      doc.setFont(font, "normal");
      doc.setTextColor(...ESTIMATE_COLORS.muted);
      const label = `${row.label}:  `;
      doc.text(label, margin, y);
      const lw = doc.getTextWidth(label);
      doc.setTextColor(...ESTIMATE_COLORS.ink);
      const valueLines = doc.splitTextToSize(row.value, leftW - lw) as string[];
      doc.text(valueLines, margin + lw, y);
      y += Math.max(4.8, valueLines.length * 4.2);
    }
    return Math.max(y + 4, 42);
  };

  const drawMiniHeader = () => {
    drawBrand(true);
    doc.setFont(font, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...ESTIMATE_COLORS.muted);
    const bits = [`КП №${meta.proposalNumber || "—"}`, meta.eventName || ""]
      .filter(Boolean)
      .join("  ·  ");
    doc.text(bits, margin, 9);
    doc.setTextColor(...ESTIMATE_COLORS.ink);
    return 20;
  };

  const headerBottom = drawFullHeader();
  const lastY = () => (doc as PdfWithTable).lastAutoTable?.finalY ?? headerBottom;

  const tableBase = {
    styles: {
      font,
      fontSize: 8,
      cellPadding: 1.4,
      textColor: ESTIMATE_COLORS.ink,
      lineWidth: 0,
      valign: "middle" as const,
      halign: "left" as const,
    },
    headStyles: {
      font,
      fontStyle: "bold" as const,
      fillColor: ESTIMATE_COLORS.header,
      textColor: ESTIMATE_COLORS.muted,
      fontSize: 7,
      halign: "left" as const,
    },
    margin: { left: margin, right: margin, top: 20, bottom },
    theme: "plain" as const,
    didDrawPage: (data: { pageNumber: number }) => {
      if (doc.getNumberOfPages() > 1 && data.pageNumber > 1) {
        drawMiniHeader();
      }
    },
    didDrawCell: (data: {
      cell: { x: number; y: number; width: number; height: number };
      section: string;
    }) => drawBottomRule(doc, data),
  };

  const itemColumns = {
    0: { cellWidth: 10, halign: "center" as const },
    1: { cellWidth: innerW - 10 - 16 - 28 - 32, halign: "left" as const },
    2: { cellWidth: 16, halign: "center" as const },
    3: { cellWidth: 28, halign: "right" as const },
    4: { cellWidth: 32, halign: "right" as const },
  };

  if (filters.includeSummary) {
    autoTable(doc, {
      ...tableBase,
      startY: headerBottom,
      head: [
        cashless
          ? ["№", "Коммерческое предложение", "Оборудование", "Услуги", "Итого", "Налог", "К оплате"]
          : ["№", "Коммерческое предложение", "Оборудование", "Услуги", "Итого", "К оплате"],
      ],
      body: [
        ...summary.zones.map((z, i) => {
          const cash = zoneCash(z);
          const rental = cashless ? cash.rental : z.equipmentTotal + z.consumablesTotal;
          const services = cashless ? cash.services : z.servicesTotal;
          const sub = cashless ? cash.total : z.subtotal;
          const tax = cashless ? z.subtotal - cash.total : 0;
          return cashless
            ? [
                String(i + 1),
                z.name,
                formatEstimateNumber(rental),
                formatEstimateNumber(services),
                formatEstimateNumber(sub),
                formatEstimateNumber(tax),
                formatEstimateNumber(z.payable),
              ]
            : [
                String(i + 1),
                z.name,
                formatEstimateNumber(rental),
                formatEstimateNumber(services),
                formatEstimateNumber(sub),
                formatEstimateNumber(z.payable),
              ];
        }),
        cashless
          ? [
              "",
              "Итого:",
              formatEstimateNumber(summary.zones.reduce((s, z) => s + zoneCash(z).rental, 0)),
              formatEstimateNumber(summary.zones.reduce((s, z) => s + zoneCash(z).services, 0)),
              formatEstimateNumber(summary.zones.reduce((s, z) => s + zoneCash(z).total, 0)),
              "",
              formatEstimateNumber(summary.payable),
            ]
          : [
              "",
              "Итого:",
              formatEstimateNumber(summary.equipmentTotal + summary.consumablesTotal),
              formatEstimateNumber(summary.servicesTotal),
              formatEstimateNumber(summary.subtotal),
              formatEstimateNumber(summary.payable),
            ],
      ],
      columnStyles: cashless
        ? {
            0: { cellWidth: 10, halign: "center" },
            1: {
              cellWidth: innerW - 10 - 26 - 24 - 26 - 24 - 28,
              halign: "left",
            },
            2: { cellWidth: 26, halign: "right" },
            3: { cellWidth: 24, halign: "right" },
            4: { cellWidth: 26, halign: "right" },
            5: { cellWidth: 24, fontSize: 7, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
          }
        : {
            0: { cellWidth: 10, halign: "center" },
            1: {
              cellWidth: innerW - 10 - 28 - 26 - 28 - 30,
              halign: "left",
            },
            2: { cellWidth: 28, halign: "right" },
            3: { cellWidth: 26, halign: "right" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 30, halign: "right" },
          },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === summary.zones.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = ESTIMATE_COLORS.total;
        }
      },
    });
  }

  const freshPageY = () => {
    doc.addPage();
    return drawMiniHeader();
  };

  const drawTotals = (z: ZoneTotals, y0: number) => {
    const cash = zoneCash(z);
    const lines: Array<[string, string]> = [
      [
        "ИТОГО — АРЕНДА",
        formatEstimateNumber(cashless ? cash.rental : z.equipmentTotal + z.consumablesTotal),
      ],
      [
        "ИТОГО — УСЛУГИ",
        formatEstimateNumber(cashless ? cash.services : z.servicesTotal),
      ],
      ["ИТОГО", formatEstimateNumber(cashless ? cash.total : z.subtotal)],
    ];
    if (cashless) {
      lines.push([
        `Налоги, банк ${cashlessRate(meta).toFixed(2)}%`,
        formatEstimateNumber(z.subtotal - cash.total),
      ]);
    }
    if (showDisc) {
      lines.push([`Скидка ${meta.discountPercent}%`, formatEstimateNumber(z.discount)]);
    }
    lines.push(["К ОПЛАТЕ", formatEstimateNumber(z.payable)]);
    let y = y0;
    const need = lines.length * 6 + 16;
    if (shouldStartNewPage(remainingPageMm(pageH, y, bottom), need)) {
      y = freshPageY();
    }
    autoTable(doc, {
      ...tableBase,
      startY: y,
      showHead: "never",
      body: lines,
      columnStyles: {
        0: { cellWidth: innerW - 42, halign: "right" },
        1: { cellWidth: 42, halign: "right", fontStyle: "bold" },
      },
      didParseCell: (data) => {
        data.cell.styles.fillColor = ESTIMATE_COLORS.total;
        if (data.row.index === lines.length - 1) data.cell.styles.fontStyle = "bold";
      },
    });
    y = lastY() + 3;
  };

  const drawDisclaimer = (y0: number) => {
    let y = y0;
    const disc = doc.splitTextToSize(ESTIMATE_DISCLAIMER, innerW) as string[];
    const need = disc.length * 3.2 + 4;
    if (shouldStartNewPage(remainingPageMm(pageH, y, bottom), need)) {
      y = freshPageY();
    }
    doc.setFont(font, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...ESTIMATE_COLORS.muted);
    doc.text(disc, margin, y);
    doc.setTextColor(...ESTIMATE_COLORS.ink);
  };

  const drawGroup = (
    startY: number,
    sections: Array<{ title: string; items: CalcBlock[] }>,
    nameHeader: string,
  ) => {
    let y = startY;
    for (const section of sections) {
      if (shouldStartNewPage(remainingPageMm(pageH, y, bottom), 28)) {
        y = freshPageY();
      }
      autoTable(doc, {
        ...tableBase,
        startY: y,
        showHead: "never",
        body: [[section.title]],
        styles: {
          ...tableBase.styles,
          fillColor: ESTIMATE_COLORS.category,
          fontStyle: "bold",
          fontSize: 9,
          halign: "left",
        },
        columnStyles: { 0: { cellWidth: innerW, halign: "left" } },
      });
      y = lastY() + 0.2;
      const body = section.items.map((item, idx) => {
        const priced = showPriceFor(item, filters);
        return [
          String(idx + 1),
          item.name || "",
          String(item.qty ?? 0),
          priced ? formatEstimateNumber(itemUnit(item, cashless)) : "—",
          priced ? formatEstimateNumber(itemSum(item, cashless)) : "—",
        ];
      });
      const sub = section.items.reduce(
        (s, item) => s + (showPriceFor(item, filters) ? itemSum(item, cashless) : 0),
        0,
      );
      body.push(["", `Итого ${section.title}:`, "", "", formatEstimateNumber(sub)]);
      autoTable(doc, {
        ...tableBase,
        startY: y,
        head: [["№", nameHeader, "Кол-во", "Цена", "Сумма"]],
        body,
        columnStyles: itemColumns,
        didParseCell: (data) => {
          if (data.section === "head") {
            if (data.column.index >= 3) data.cell.styles.halign = "right";
            if (data.column.index === 0 || data.column.index === 2) {
              data.cell.styles.halign = "center";
            }
          }
          if (data.section === "body" && data.row.index === body.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = ESTIMATE_COLORS.total;
            if (data.column.index !== 4) data.cell.styles.halign = "right";
          }
        },
      });
      y = lastY() + 2;
    }
    return y;
  };

  let started = filters.includeSummary;
  for (const z of summary.zones) {
    let y = started ? lastY() + 8 : headerBottom;
    started = true;
    if (shouldStartNewPage(remainingPageMm(pageH, y, bottom))) {
      y = freshPageY();
    }
    autoTable(doc, {
      ...tableBase,
      startY: y,
      showHead: "never",
      body: [[z.name.toUpperCase()]],
      styles: {
        ...tableBase.styles,
        fillColor: ESTIMATE_COLORS.zone,
        fontStyle: "bold",
        fontSize: 10,
        halign: "left",
      },
      columnStyles: { 0: { cellWidth: innerW, halign: "left" } },
    });
    const rentalSections = z.doc.sections
      .map((section) => ({
        title: section.title,
        items: partitionByKind(section.items, costKindOf).rental,
      }))
      .filter((s) => s.items.length > 0);
    const serviceSections = z.doc.sections
      .map((section) => ({
        title: section.title,
        items: partitionByKind(section.items, costKindOf).services,
      }))
      .filter((s) => s.items.length > 0);
    if (rentalSections.length) drawGroup(lastY() + 1, rentalSections, "Оборудование");
    if (serviceSections.length) drawGroup(lastY() + 2, serviceSections, "Услуги");
    drawTotals(z, lastY() + 4);
  }

  drawDisclaimer(lastY() + 6);

  const filename = `${filenameBase(meta)}.pdf`;
  const blob = doc.output("blob");
  if (opts?.download !== false) downloadBlob(blob, filename);
  return { blob, filename };
}
