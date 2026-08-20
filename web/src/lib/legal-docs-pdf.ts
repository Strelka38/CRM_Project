import { jsPDF } from "jspdf";
import { safeFilename } from "./format";
import {
  buildActText,
  buildContractText,
  buildInvoiceText,
  type LegalDocInput,
} from "./legal-docs";
import { knockOutBlackToPng } from "./legal-seal";

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

type PdfDoc = jsPDF;

function writeTextBlock(
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH: number,
  pageBottom: number,
  margin: number,
): number {
  const paragraphs = text.split("\n");
  for (const p of paragraphs) {
    const lines = p.trim() === "" ? [""] : (doc.splitTextToSize(p, maxWidth) as string[]);
    for (const line of lines) {
      if (y > pageBottom) {
        doc.addPage();
        y = margin;
      }
      if (line) doc.text(line, x, y);
      y += lineH;
    }
  }
  return y;
}

function addFacsimile(
  doc: PdfDoc,
  seal: string | null,
  signature: string | null,
  x: number,
  y: number,
) {
  try {
    if (seal) doc.addImage(seal, "PNG", x, y - 8, 38, 38);
  } catch {
    /* ignore decode */
  }
  try {
    if (signature) doc.addImage(signature, "PNG", x + 22, y + 4, 42, 18);
  } catch {
    /* ignore decode */
  }
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
  const [regular, bold, seal, signature] = await Promise.all([
    loadFontBase64("/fonts/NotoSans-Regular.ttf"),
    loadFontBase64("/fonts/NotoSans-Bold.ttf"),
    opts.hasSeal
      ? fetchPngDataUrl(`/api/legal-entities/${opts.entityId}/seal`)
      : Promise.resolve(null),
    opts.hasSignature
      ? fetchPngDataUrl(`/api/legal-entities/${opts.entityId}/signature`)
      : Promise.resolve(null),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.addFileToVFS("NotoSans-Regular.ttf", regular);
  doc.addFileToVFS("NotoSans-Bold.ttf", bold);
  doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
  doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
  doc.setFont("NotoSans", "normal");

  const margin = 18;
  const maxWidth = 174;
  const lineH = 4.6;
  const pageBottom = 280;
  let first = true;

  const sections: Array<{ title: string; body: string; facsimile: boolean }> = [];
  if (opts.includeContract) {
    sections.push({
      title: "Договор",
      body: buildContractText(opts.input),
      facsimile: true,
    });
  }
  if (opts.includeInvoice) {
    sections.push({
      title: "Счёт",
      body: buildInvoiceText(opts.input),
      facsimile: true,
    });
  }
  if (opts.includeAct) {
    sections.push({
      title: "Акт",
      body: buildActText(opts.input),
      facsimile: true,
    });
  }

  for (const section of sections) {
    if (!first) doc.addPage();
    first = false;
    doc.setFont("NotoSans", "bold");
    doc.setFontSize(11);
    let y = margin;
    const titleLine = section.body.split("\n")[0] || section.title;
    const rest = section.body.split("\n").slice(1).join("\n");
    y = writeTextBlock(doc, titleLine, margin, y, maxWidth, 6, pageBottom, margin);
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(9.5);
    y = writeTextBlock(doc, rest, margin, y + 1, maxWidth, lineH, pageBottom, margin);
    if (section.facsimile) {
      if (y > pageBottom - 42) {
        doc.addPage();
        y = margin;
      }
      addFacsimile(doc, seal, signature, margin + 4, y + 6);
    }
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
