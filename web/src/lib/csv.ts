import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseCsv, toCsv } from "@/lib/catalog-csv";

export const directoryBulkSchema = z.object({
  action: z.enum(["delete", "copy"]),
  ids: z.array(z.string()).min(1),
});

export { parseCsv, toCsv };

export function csvHeaderIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, idx) => {
    map.set(h.trim().toLowerCase(), idx);
  });
  return map;
}

export function csvCell(
  map: Map<string, number>,
  row: string[],
  ...names: string[]
): string {
  for (const name of names) {
    const idx = map.get(name.toLowerCase());
    if (idx != null && row[idx] != null) return row[idx];
  }
  return "";
}

export function csvNum(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function csvBool(v: string | undefined, fallback = true): boolean {
  if (v == null || v.trim() === "") return fallback;
  const t = v.trim().toLowerCase();
  if (["0", "false", "нет", "no", "n", "off"].includes(t)) return false;
  if (["1", "true", "да", "yes", "y", "on"].includes(t)) return true;
  return fallback;
}

export function uniqueCopyName(base: string, taken: Iterable<string>): string {
  const takenSet = new Set(
    [...taken].map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  const stem =
    base.replace(/\s*\(копия(?:\s+\d+)?\)\s*$/i, "").trim() || base.trim();
  let n = 0;
  while (true) {
    const name = n === 0 ? `${stem} (копия)` : `${stem} (копия ${n + 1})`;
    if (!takenSet.has(name.toLowerCase())) return name;
    n += 1;
    if (n > 500) return `${stem} (копия ${Date.now()})`;
  }
}

export function csvFileResponse(filename: string, rows: string[][]): NextResponse {
  const csv = `\uFEFF${toCsv(rows)}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

export function jsonFileResponse(filename: string, body: unknown): NextResponse {
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function readUploadedCsv(
  req: NextRequest,
  maxBytes = 20 * 1024 * 1024,
): Promise<{ text: string } | { error: NextResponse }> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return {
      error: NextResponse.json({ error: "Файл обязателен" }, { status: 400 }),
    };
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return {
      error: NextResponse.json(
        { error: `Файл больше ${mb} МБ` },
        { status: 400 },
      ),
    };
  }
  return { text: await file.text() };
}
