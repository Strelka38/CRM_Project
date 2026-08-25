export const BRAND_NAME = "Байкал Стейдж Групп";
export const BRAND_SITE = "baikalstagegroup.ru";
export const BRAND_LOGO_URL = "/brand/bsg-logo.png";

export type KpHeaderInput = {
  proposalNumber?: string;
  eventName?: string;
  date?: string;
  place?: string;
  client?: string;
  /** Поле «Контактная информация» в карточке КП. */
  requestContact?: string;
  managerName?: string;
  managerPhone?: string;
};

export type KpHeaderField = { label: string; value: string };

export type KpHeaderModel = {
  title: string;
  rows: KpHeaderField[];
};

/** ФИО менеджера + телефон для строки «Менеджер». */
export function formatManagerContact(
  name?: string,
  phone?: string,
): string {
  const n = name?.trim() || "";
  const p = phone?.trim() || "";
  if (n && p) return `${n}, ${p}`;
  if (n) return n;
  if (p) return p;
  return "—";
}

export function buildKpHeader(meta: KpHeaderInput): KpHeaderModel {
  return {
    title: meta.eventName?.trim() || "Коммерческое предложение",
    rows: [
      { label: "КП №", value: meta.proposalNumber?.trim() || "—" },
      { label: "Дата проведения", value: meta.date?.trim() || "—" },
      { label: "Заказчик", value: meta.client?.trim() || "—" },
      {
        label: "Контакт от заказчика",
        value: meta.requestContact?.trim() || "—",
      },
      {
        label: "Менеджер",
        value: formatManagerContact(meta.managerName, meta.managerPhone),
      },
      { label: "Место", value: meta.place?.trim() || "—" },
    ],
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Белые кольца на чёрном → тёмный знак на прозрачном, как invert на светлой теме. */
export async function invertWhiteOnBlackToPng(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blobToDataUrl(blob);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r0 = d[i];
    const g0 = d[i + 1];
    const b0 = d[i + 2];
    const luma0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    if (luma0 < 28) {
      d[i + 3] = 0;
      continue;
    }
    d[i] = 15;
    d[i + 1] = 23;
    d[i + 2] = 41;
    d[i + 3] = Math.min(255, Math.round(luma0));
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function loadPrintBrandMark(): Promise<string | null> {
  try {
    const res = await fetch(BRAND_LOGO_URL);
    if (!res.ok) return null;
    return await invertWhiteOnBlackToPng(await res.blob());
  } catch {
    return null;
  }
}
