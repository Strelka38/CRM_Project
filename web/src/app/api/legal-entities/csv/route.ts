import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  LEGAL_CSV_HEADERS,
  legalEntityToCsvCells,
  parseLegalCsv,
} from "@/lib/directory-csv";
import { digitsAccount, legalEntityInclude } from "@/lib/legal-entity";
import { requireDatabaseAccess } from "@/lib/session";

export async function GET() {
  try {
    await requireDatabaseAccess();
    const rows = await prisma.legalEntity.findMany({
      orderBy: { shortName: "asc" },
      include: legalEntityInclude,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`legal-entities-${stamp}.csv`, [
      [...LEGAL_CSV_HEADERS],
      ...rows.map((e) => legalEntityToCsvCells(e)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/legal-entities/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseLegalCsv(uploaded.text);
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
        shortName: r.shortName,
        fullName: r.fullName,
        inn: r.inn,
        ogrnip: r.ogrnip,
        legalAddress: r.legalAddress,
        actualAddress: r.actualAddress || r.legalAddress,
        phone: r.phone,
        email: r.email,
        catalogOwner: r.catalogOwner,
        signatoryName: r.signatoryName,
        active: r.active,
      };
      const accounts = r.accounts
        .filter((a) => a.account)
        .map((a, idx) => ({
          label: a.label,
          bankName: a.bankName,
          account: digitsAccount(a.account),
          corrAccount: digitsAccount(a.corrAccount),
          bik: digitsAccount(a.bik),
          isDefault: a.isDefault,
          sortOrder: idx,
        }));
      try {
        const byId = r.id
          ? await prisma.legalEntity.findUnique({ where: { id: r.id }, select: { id: true } })
          : null;
        const byInn = await prisma.legalEntity.findUnique({
          where: { inn: r.inn },
          select: { id: true },
        });
        const existingId = byId?.id || byInn?.id;
        if (existingId) {
          await prisma.legalEntity.update({ where: { id: existingId }, data });
          if (accounts.length) {
            await prisma.legalEntityBankAccount.deleteMany({
              where: { legalEntityId: existingId },
            });
            await prisma.legalEntityBankAccount.createMany({
              data: accounts.map((a) => ({ ...a, legalEntityId: existingId })),
            });
          }
          updated += 1;
          continue;
        }
        await prisma.legalEntity.create({
          data: {
            ...data,
            bankAccounts: accounts.length ? { create: accounts } : undefined,
          },
        });
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
    console.error("[POST /api/legal-entities/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
