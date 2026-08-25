import type { jsPDF } from "jspdf";

export async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить шрифт ${url}`);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export type PdfFontFamily = {
  name: string;
  regularUrl: string;
  boldUrl: string;
  regularFile: string;
  boldFile: string;
};

export const SANS_FONTS: PdfFontFamily = {
  name: "DocSans",
  regularUrl: "/fonts/DocSans.ttf",
  boldUrl: "/fonts/DocSans-Bold.ttf",
  regularFile: "DocSans.ttf",
  boldFile: "DocSans-Bold.ttf",
};

export const SERIF_FONTS: PdfFontFamily = {
  name: "DocSerif",
  regularUrl: "/fonts/DocSerif.ttf",
  boldUrl: "/fonts/DocSerif-Bold.ttf",
  regularFile: "DocSerif.ttf",
  boldFile: "DocSerif-Bold.ttf",
};

export const NOTO_FONTS: PdfFontFamily = {
  name: "NotoSans",
  regularUrl: "/fonts/NotoSans-Regular.ttf",
  boldUrl: "/fonts/NotoSans-Bold.ttf",
  regularFile: "NotoSans-Regular.ttf",
  boldFile: "NotoSans-Bold.ttf",
};

async function loadFamily(family: PdfFontFamily) {
  const [regular, bold] = await Promise.all([
    loadFontBase64(family.regularUrl),
    loadFontBase64(family.boldUrl),
  ]);
  return { family, regular, bold };
}

export async function loadSansFonts() {
  try {
    return await loadFamily(SANS_FONTS);
  } catch {
    return await loadFamily(NOTO_FONTS);
  }
}

export async function loadSerifFonts() {
  try {
    return await loadFamily(SERIF_FONTS);
  } catch {
    return await loadFamily(NOTO_FONTS);
  }
}

export function registerPdfFont(
  doc: jsPDF,
  pack: Awaited<ReturnType<typeof loadFamily>>,
) {
  const { family, regular, bold } = pack;
  doc.addFileToVFS(family.regularFile, regular);
  doc.addFileToVFS(family.boldFile, bold);
  doc.addFont(family.regularFile, family.name, "normal");
  doc.addFont(family.boldFile, family.name, "bold");
  doc.setFont(family.name, "normal");
  return family.name;
}
