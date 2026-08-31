import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { createQuoteFromStructure } from "@/lib/quote-clone";
import { notifyManagersOfNewEvent } from "@/lib/notifications";
import {
  applyCatalogMatches,
  parseArtemWorkbook,
} from "@/lib/quote-excel-import";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const MAX_FILES = 50;
const ALLOWED_EXT = /\.(xlsx|xlsm)$/i;

type CatalogRow = { id: string; name: string };

type ImportedQuote = {
  fileName: string;
  id: string;
  proposalNumber: string;
  itemCount: number;
  matched: number;
  unmatched: string[];
  warnings: string[];
};

type FailedImport = {
  fileName: string;
  error: string;
};

async function importOneFile(
  file: File,
  session: { user: { id: string; name?: string | null } },
  catalog: CatalogRow[],
): Promise<ImportedQuote | FailedImport> {
  const fileName = file.name || "файл.xlsx";
  if (file.size > MAX_BYTES) {
    return { fileName, error: "Файл больше 20 МБ" };
  }
  if (!ALLOWED_EXT.test(fileName)) {
    return { fileName, error: "Нужен файл .xlsx или .xlsm" };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseArtemWorkbook(buf, { fileName });
  } catch (e) {
    console.error("parseArtemWorkbook", fileName, e);
    return { fileName, error: "Не удалось прочитать Excel-файл" };
  }

  if (parsed.itemCount === 0) {
    return { fileName, error: "Нет позиций с количеством больше 0" };
  }

  const { structure, unmatched } = applyCatalogMatches(
    parsed.structure,
    catalog,
  );

  const quote = await createQuoteFromStructure({
    ownerId: session.user.id,
    managerName: parsed.meta.managerName || session.user.name || "",
    date: parsed.meta.date,
    durationDays: parsed.meta.durationDays,
    eventName: parsed.meta.eventName,
    time: parsed.meta.time,
    place: parsed.meta.place,
    client: parsed.meta.client,
    cashless: parsed.meta.cashless,
    structure,
  });

  await notifyManagersOfNewEvent({
    id: quote.id,
    eventName: quote.eventName,
    proposalNumber: quote.proposalNumber,
    ownerId: quote.ownerId,
    date: quote.date,
    managerName: quote.managerName,
  });

  return {
    fileName,
    id: quote.id,
    proposalNumber: quote.proposalNumber,
    itemCount: parsed.itemCount,
    matched: parsed.itemCount - unmatched.length,
    unmatched,
    warnings: parsed.warnings,
  };
}

function collectFiles(form: FormData): File[] {
  const out: File[] = [];
  for (const key of ["file", "files"]) {
    for (const value of form.getAll(key)) {
      if (value instanceof File && value.size > 0) out.push(value);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireManager();
    const form = await req.formData();
    const files = collectFiles(form);
    if (files.length === 0) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `За один раз не больше ${MAX_FILES} файлов` },
        { status: 400 },
      );
    }
    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "Суммарный размер файлов больше 80 МБ" },
        { status: 400 },
      );
    }

    const catalog = await prisma.catalogItem.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    const imported: ImportedQuote[] = [];
    const failed: FailedImport[] = [];
    for (const file of files) {
      const result = await importOneFile(file, session, catalog);
      if ("id" in result) imported.push(result);
      else failed.push(result);
    }

    if (imported.length === 0) {
      const first = failed[0];
      return NextResponse.json(
        {
          error: first?.error || "Не удалось импортировать сметы",
          imported,
          failed,
        },
        { status: 400 },
      );
    }

    const first = imported[0];
    return NextResponse.json(
      {
        imported,
        failed,
        id: first.id,
        proposalNumber: first.proposalNumber,
        itemCount: first.itemCount,
        matched: first.matched,
        unmatched: first.unmatched,
        warnings: first.warnings,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("POST /api/quotes/import-excel", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Не удалось импортировать смету",
      },
      { status: 500 },
    );
  }
}
