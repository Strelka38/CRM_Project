import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { safeFilename } from "./format";
import {
  buildContractText,
  subjectLine,
  type LegalDocInput,
} from "./legal-docs";
import { knockOutBlackToPng } from "./legal-seal";
import { rublesInWords, rublesInWordsCapitalized } from "./rubles-words";
import {
  loadSansFonts,
  loadSerifFonts,
  registerPdfFont,
} from "./export/pdf-fonts";

async function fetchPngDataUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  try {
    return await knockOutBlackToPng(blob);
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function money2(n: number) {
  return Math.round(n).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function partyLine(p: {
  fullName?: string;
  shortName?: string;
  inn: string;
  ogrnip?: string;
  legalAddress: string;
  phone?: string;
  extra?: string;
}) {
  const bits = [
    p.fullName || p.shortName || "",
    p.inn ? `ИНН ${p.inn}` : "",
    p.ogrnip ? `ОГРНИП ${p.ogrnip}` : "",
    p.legalAddress,
    p.phone ? `тел.: ${p.phone}` : "",
    p.extra,
  ].filter(Boolean);
  return bits.join(", ");
}

function addFacsimile(
  doc: jsPDF,
  seal: string | null,
  signature: string | null,
  x: number,
  y: number,
) {
  try {
    if (seal) doc.addImage(seal, "PNG", x, y - 6, 36, 36);
  } catch {
    /* ignore */
  }
  try {
    if (signature) doc.addImage(signature, "PNG", x + 20, y + 6, 40, 16);
  } catch {
    /* ignore */
  }
}

function drawBankHeader(doc: jsPDF, font: string, input: LegalDocInput, y: number) {
  const x = 15;
  const w = 180;
  const row1 = 8;
  const row2 = 10;
  const row3 = 14;
  const leftW = 118;
  const rightW = w - leftW;
  const h = row1 + row2 + row3;

  doc.setDrawColor(0);
  doc.setLineWidth(0.35);
  doc.rect(x, y, w, h);
  doc.line(x + leftW, y, x + leftW, y + h);
  doc.line(x, y + row1, x + w, y + row1);
  doc.line(x + leftW, y + row1 + row2, x + w, y + row1 + row2);
  doc.line(x, y + row1 + row2, x + leftW, y + row1 + row2);
  doc.line(x + 28, y + row1 + row2, x + 28, y + h);
  doc.line(x + 28 + 40, y + row1 + row2, x + 28 + 40, y + h);
  doc.line(x + leftW + 18, y, x + leftW + 18, y + h);

  doc.setFont(font, "normal");
  doc.setFontSize(7);
  doc.text("Банк получателя", x + 1.5, y + h - 1.8);
  doc.setFontSize(9);
  const bankName = doc.splitTextToSize(input.bank.bankName || "—", leftW - 4) as string[];
  doc.text(bankName, x + 2, y + 5);

  doc.setFontSize(8);
  doc.text("БИК", x + leftW + 2, y + 4);
  doc.setFontSize(9);
  doc.text(input.bank.bik || "", x + leftW + 20, y + 5);
  doc.setFontSize(8);
  doc.text("Сч. №", x + leftW + 2, y + row1 + 4);
  doc.setFontSize(9);
  doc.text(input.bank.corrAccount || "", x + leftW + 20, y + row1 + 6.5);

  doc.setFontSize(8);
  doc.text("ИНН", x + 2, y + row1 + row2 + 4);
  doc.setFontSize(9);
  doc.text(input.executor.inn || "", x + 2, y + row1 + row2 + 10);
  doc.setFontSize(8);
  doc.text("КПП", x + 30, y + row1 + row2 + 4);
  doc.setFontSize(9);
  doc.text("", x + 30, y + row1 + row2 + 10);
  doc.setFontSize(8);
  doc.text("Сч. №", x + leftW + 2, y + row1 + row2 + 4);
  doc.setFontSize(9);
  doc.text(input.bank.account || "", x + leftW + 20, y + row1 + row2 + 10);

  const recv = doc.splitTextToSize(
    (input.executor.fullName || input.executor.shortName || "—") + "    Получатель",
    leftW - 6,
  ) as string[];
  doc.setFontSize(8);
  doc.text(recv, x + 70, y + row1 + row2 + 6);
  return y + h + 6;
}

function drawInvoice(
  doc: jsPDF,
  font: string,
  input: LegalDocInput,
  seal: string | null,
  signature: string | null,
) {
  let y = drawBankHeader(doc, font, input, 12);
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.text(
    `Счет на оплату № ${input.contractNumber || "___"} от ${input.contractDate}`,
    15,
    y,
  );
  y += 3;
  doc.setLineWidth(0.6);
  doc.line(15, y, 195, y);
  y += 8;

  doc.setFont(font, "normal");
  doc.setFontSize(9);
  const supplier = partyLine({
    fullName: input.executor.fullName,
    shortName: input.executor.shortName,
    inn: input.executor.inn,
    ogrnip: input.executor.ogrnip,
    legalAddress: input.executor.legalAddress,
    phone: input.executor.phone,
  });
  const buyer = partyLine({
    fullName: input.customer.companyName,
    inn: input.customer.inn,
    legalAddress: input.customer.legalAddress,
    extra: input.customer.legalDetails,
  });
  doc.setFont(font, "bold");
  doc.text("Поставщик", 15, y);
  doc.setFont(font, "normal");
  const sLines = doc.splitTextToSize(`(Исполнитель):  ${supplier}`, 155) as string[];
  doc.text(sLines, 40, y);
  y += sLines.length * 4.2 + 4;

  doc.setFont(font, "bold");
  doc.text("Покупатель", 15, y);
  doc.setFont(font, "normal");
  const bLines = doc.splitTextToSize(`(Заказчик):  ${buyer || "—"}`, 155) as string[];
  doc.text(bLines, 40, y);
  y += bLines.length * 4.2 + 4;

  doc.setFont(font, "bold");
  doc.text("Основание:", 15, y);
  doc.setFont(font, "normal");
  doc.text(
    `Договор № ${input.contractNumber || "___"} от ${input.contractDate}`,
    40,
    y,
  );
  y += 6;

  const name = `Техническое сопровождение мероприятия «${subjectLine(input)}»`;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font,
      fontSize: 9,
      cellPadding: 1.6,
      lineColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.25,
      valign: "middle",
    },
    headStyles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: 20, halign: "center" },
    head: [["№", "Товары (работы, услуги)", "Кол-во", "Ед.", "Цена", "Сумма"]],
    body: [["1", name, "1", "шт", money2(input.amount), money2(input.amount)]],
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 92, halign: "left" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
    },
    margin: { left: 15, right: 15 },
  });
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;

  doc.setFont(font, "bold");
  doc.setFontSize(10);
  doc.text(`Итого:  ${money2(input.amount)}`, 195, y, { align: "right" });
  y += 5;
  doc.setFont(font, "normal");
  doc.text("Без налога (НДС)  —", 195, y, { align: "right" });
  y += 5;
  doc.setFont(font, "bold");
  doc.text(`Всего к оплате:  ${money2(input.amount)}`, 195, y, { align: "right" });
  y += 8;
  doc.setFont(font, "normal");
  doc.setFontSize(9);
  doc.text(`Всего наименований 1, на сумму ${money2(input.amount)} руб.`, 15, y);
  y += 5;
  doc.setFont(font, "bold");
  const words = doc.splitTextToSize(rublesInWordsCapitalized(input.amount), 180) as string[];
  doc.text(words, 15, y);
  y += words.length * 4.5 + 6;

  doc.setFont(font, "normal");
  doc.setFontSize(8);
  const terms = [
    "Оплата данного счета означает согласие Заказчика с условиями оказания услуг:",
    "1. Исполнитель обязуется оказать Заказчику услуги, а Заказчик обязуется их принять и оплатить.",
    "2. Сведения об оказываемых услугах содержатся в настоящем счете.",
    "3. Оплата услуг осуществляется Заказчиком путем безналичного перевода денежных средств на расчетный счет Исполнителя с обязательным указанием в платежном поручении реквизитов настоящего счета.",
  ];
  for (const t of terms) {
    const lines = doc.splitTextToSize(t, 180) as string[];
    doc.text(lines, 15, y);
    y += lines.length * 3.6 + 1;
  }
  y += 8;
  doc.setFont(font, "bold");
  doc.setFontSize(10);
  doc.text("Предприниматель", 15, y);
  addFacsimile(doc, seal, signature, 55, y - 4);
  doc.setFont(font, "normal");
  doc.setFontSize(9);
  doc.text(input.executor.signatoryName || input.executor.shortName, 120, y);
}

function drawAct(
  doc: jsPDF,
  font: string,
  input: LegalDocInput,
  seal: string | null,
  signature: string | null,
) {
  let y = 16;
  doc.setFont(font, "bold");
  doc.setFontSize(14);
  doc.text(`Акт № ${input.contractNumber || "___"} от ${input.contractDate}`, 105, y, {
    align: "center",
  });
  y += 8;
  doc.setFont(font, "normal");
  doc.setFontSize(9);

  const putPair = (label: string, value: string) => {
    doc.setFont(font, "bold");
    doc.text(label, 15, y);
    doc.setFont(font, "normal");
    const lines = doc.splitTextToSize(value, 150) as string[];
    doc.text(lines, 45, y);
    y += lines.length * 4.2 + 3;
  };

  putPair(
    "Исполнитель:",
    partyLine({
      fullName: input.executor.fullName,
      shortName: input.executor.shortName,
      inn: input.executor.inn,
      ogrnip: input.executor.ogrnip,
      legalAddress: input.executor.legalAddress,
      phone: input.executor.phone,
      extra: `р/с ${input.bank.account}, в банке ${input.bank.bankName}, БИК ${input.bank.bik}, к/с ${input.bank.corrAccount}`,
    }),
  );
  putPair(
    "Заказчик:",
    partyLine({
      fullName: input.customer.companyName,
      inn: input.customer.inn,
      legalAddress: input.customer.legalAddress,
      extra: input.customer.legalDetails,
    }),
  );
  putPair(
    "Основание:",
    `Договор № ${input.contractNumber || "___"} от ${input.contractDate}`,
  );

  const name = `Техническое сопровождение мероприятия «${subjectLine(input)}»`;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font,
      fontSize: 9,
      cellPadding: 1.6,
      lineColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.25,
      valign: "middle",
    },
    headStyles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: 20, halign: "center" },
    head: [["№", "Наименование работ, услуг", "Кол-во", "Ед.", "Цена", "Сумма"]],
    body: [["1", name, "1", "шт", money2(input.amount), money2(input.amount)]],
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 92, halign: "left" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
    },
    margin: { left: 15, right: 15 },
  });
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  doc.setFont(font, "bold");
  doc.text(`Итого:  ${money2(input.amount)}`, 195, y, { align: "right" });
  y += 5;
  doc.setFont(font, "normal");
  doc.text("Без налога (НДС)  —", 195, y, { align: "right" });
  y += 7;
  doc.text(`Всего оказано услуг 1, на сумму ${money2(input.amount)} руб.`, 15, y);
  y += 5;
  doc.setFont(font, "bold");
  const words = doc.splitTextToSize(rublesInWordsCapitalized(input.amount), 180) as string[];
  doc.text(words, 15, y);
  y += words.length * 4.5 + 6;
  doc.setFont(font, "normal");
  doc.setFontSize(9);
  const claim = doc.splitTextToSize(
    "Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.",
    180,
  ) as string[];
  doc.text(claim, 15, y);
  y += claim.length * 4.2 + 12;

  doc.setFont(font, "bold");
  doc.text("ИСПОЛНИТЕЛЬ", 15, y);
  doc.text("ЗАКАЗЧИК", 115, y);
  y += 6;
  doc.setFont(font, "normal");
  doc.setFontSize(8);
  const exName = doc.splitTextToSize(
    input.executor.fullName || input.executor.shortName,
    80,
  ) as string[];
  const cuName = doc.splitTextToSize(input.customer.companyName || "—", 80) as string[];
  doc.text(exName, 15, y);
  doc.text(cuName, 115, y);
  addFacsimile(doc, seal, signature, 15, y + 8);
  y += Math.max(exName.length, cuName.length) * 4 + 22;
  doc.setFontSize(9);
  doc.text(input.executor.signatoryName || "", 15, y);
}

function drawContract(
  doc: jsPDF,
  font: string,
  input: LegalDocInput,
  seal: string | null,
  signature: string | null,
) {
  const full = buildContractText(input);
  const cut = full.search(/\n11\.\s/u);
  const body = cut >= 0 ? full.slice(0, cut).trim() : full;
  let y = 18;
  const margin = 18;
  const width = 174;
  const bottom = 280;

  const write = (text: string, size: number, style: "normal" | "bold", extra = 0) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      if (y > bottom) {
        doc.addPage();
        y = margin;
      }
      if (line) doc.text(line, margin, y);
      y += size * 0.42 + extra;
    }
  };

  doc.setFont(font, "bold");
  doc.setFontSize(13);
  doc.text(
    `ДОГОВОР ОКАЗАНИЯ УСЛУГ № ${input.contractNumber || "___"}`,
    105,
    y,
    { align: "center" },
  );
  y += 8;
  doc.setFont(font, "normal");
  doc.setFontSize(11);
  doc.text(input.city || "", margin, y);
  doc.text(`«${input.contractDate || "  "}»`, 192, y, { align: "right" });
  y += 8;

  const rest = body.split("\n").slice(3).join("\n");
  for (const para of rest.split("\n")) {
    if (!para.trim()) {
      y += 2;
      continue;
    }
    const heading = /^\d+\.\s/.test(para) && para.length < 80;
    write(para, heading ? 11 : 10.5, heading ? "bold" : "normal", heading ? 0.6 : 0.35);
    y += heading ? 1.2 : 0.6;
  }

  y += 4;
  if (y > bottom - 70) {
    doc.addPage();
    y = margin;
  }
  doc.setFont(font, "bold");
  doc.setFontSize(11);
  doc.text("11. Адреса и банковские реквизиты сторон", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font,
      fontSize: 9,
      cellPadding: 2.2,
      valign: "top",
      lineColor: [0, 0, 0] as [number, number, number],
      lineWidth: 0.25,
    },
    head: [["Исполнитель", "Заказчик"]],
    body: [
      [
        [
          input.executor.fullName || input.executor.shortName,
          `ИНН: ${input.executor.inn}`,
          `ОГРНИП: ${input.executor.ogrnip}`,
          input.executor.legalAddress,
          input.executor.phone ? `Тел: ${input.executor.phone}` : "",
          input.executor.email ? `E-mail: ${input.executor.email}` : "",
          `Р/счёт: ${input.bank.account}`,
          input.bank.bankName,
          `Кор/счёт: ${input.bank.corrAccount}`,
          `БИК: ${input.bank.bik}`,
        ]
          .filter(Boolean)
          .join("\n"),
        [
          input.customer.companyName || "",
          input.customer.inn ? `ИНН: ${input.customer.inn}` : "",
          input.customer.legalAddress,
          input.customer.legalDetails,
          input.customer.phone ? `Тел: ${input.customer.phone}` : "",
          input.customer.email ? `E-mail: ${input.customer.email}` : "",
        ]
          .filter(Boolean)
          .join("\n") || " ",
      ],
    ],
    margin: { left: margin, right: margin },
  });
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 12;
  if (y > bottom - 30) {
    doc.addPage();
    y = margin;
  }
  doc.setFont(font, "normal");
  doc.setFontSize(10);
  doc.text("Индивидуальный предприниматель:", margin, y);
  addFacsimile(doc, seal, signature, margin + 70, y - 6);
  doc.text(
    `______________________/${input.executor.signatoryName || input.executor.shortName}/`,
    margin,
    y + 16,
  );
  doc.text("Заказчик:", 115, y);
  doc.text("______________________/", 115, y + 16);
}

export async function exportLegalDocumentsPdf(opts: {
  input: LegalDocInput;
  includeContract: boolean;
  includeInvoice: boolean;
  includeAct: boolean;
  entityId: string;
  hasSeal: boolean;
  hasSignature: boolean;
  download?: boolean;
}): Promise<{ blob: Blob; filename: string }> {
  const [sans, serif, seal, signature] = await Promise.all([
    loadSansFonts(),
    loadSerifFonts(),
    opts.hasSeal
      ? fetchPngDataUrl(`/api/legal-entities/${opts.entityId}/seal`)
      : Promise.resolve(null),
    opts.hasSignature
      ? fetchPngDataUrl(`/api/legal-entities/${opts.entityId}/signature`)
      : Promise.resolve(null),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const sansName = registerPdfFont(doc, sans);
  const serifName = registerPdfFont(doc, serif);
  let first = true;
  const nextPage = () => {
    if (!first) doc.addPage();
    first = false;
  };

  if (opts.includeContract) {
    nextPage();
    drawContract(doc, serifName, opts.input, seal, signature);
  }
  if (opts.includeInvoice) {
    nextPage();
    drawInvoice(doc, sansName, opts.input, seal, signature);
  }
  if (opts.includeAct) {
    nextPage();
    drawAct(doc, sansName, opts.input, seal, signature);
  }

  const blob = doc.output("blob");
  const filename = `${safeFilename([
    opts.input.contractDate.replace(/\./g, "_"),
    opts.input.executor.signatoryName || opts.input.executor.shortName,
    opts.input.contractNumber,
    "документы",
  ])}.pdf`;
  if (opts.download !== false) downloadBlob(blob, filename);
  return { blob, filename };
}
