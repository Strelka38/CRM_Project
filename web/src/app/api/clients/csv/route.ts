import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  CLIENT_CSV_HEADERS,
  clientToCsvCells,
  parseClientCsv,
} from "@/lib/directory-csv";
import { requireDatabaseAccess } from "@/lib/session";

const clientSelect = {
  id: true,
  companyName: true,
  contactName: true,
  phone: true,
  email: true,
  comment: true,
  inn: true,
  legalAddress: true,
  legalDetails: true,
  active: true,
} as const;

export async function GET() {
  try {
    await requireDatabaseAccess();
    const clients = await prisma.client.findMany({
      orderBy: { companyName: "asc" },
      select: clientSelect,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`clients-${stamp}.csv`, [
      [...CLIENT_CSV_HEADERS],
      ...clients.map((c) => clientToCsvCells(c)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/clients/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseClientCsv(uploaded.text);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "Нет строк для импорта", errors, created: 0, updated: 0 },
        { status: 400 },
      );
    }
    let created = 0;
    let updated = 0;
    const rowErrors = [...errors];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const data = {
        companyName: r.companyName,
        contactName: r.contactName,
        phone: r.phone,
        email: r.email,
        inn: r.inn,
        legalAddress: r.legalAddress,
        legalDetails: r.legalDetails,
        comment: r.comment,
        active: r.active,
      };
      try {
        if (r.id) {
          const existing = await prisma.client.findUnique({
            where: { id: r.id },
            select: { id: true },
          });
          if (existing) {
            await prisma.client.update({ where: { id: r.id }, data });
            updated += 1;
            continue;
          }
        }
        await prisma.client.create({ data });
        created += 1;
      } catch (err) {
        rowErrors.push(
          `Строка ${i + 2}: ${err instanceof Error ? err.message : "ошибка"}`,
        );
      }
    }
    return NextResponse.json({
      created,
      updated,
      total: rows.length,
      errors: rowErrors.slice(0, 50),
      errorCount: rowErrors.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/clients/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
