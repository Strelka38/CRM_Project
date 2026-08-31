import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  FREELANCER_CSV_HEADERS,
  freelancerToCsvCells,
  parseFreelancerCsv,
} from "@/lib/directory-csv";
import { findFreelancerByName, normalizeFreelancerName } from "@/lib/freelancer-directory";
import { requireDatabaseAccess } from "@/lib/session";

const freelancerSelect = {
  id: true,
  name: true,
  comment: true,
  active: true,
} as const;

export async function GET() {
  try {
    await requireDatabaseAccess();
    const freelancers = await prisma.freelancer.findMany({
      orderBy: { name: "asc" },
      select: freelancerSelect,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`freelancers-${stamp}.csv`, [
      [...FREELANCER_CSV_HEADERS],
      ...freelancers.map((f) => freelancerToCsvCells(f)),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/freelancers/csv]", e);
    return NextResponse.json(
      { error: "Не удалось экспортировать" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseFreelancerCsv(uploaded.text);
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: errors[0] || "Нет строк для импорта",
          errors,
          created: 0,
          updated: 0,
        },
        { status: 400 },
      );
    }
    let created = 0;
    let updated = 0;
    const rowErrors = [...errors];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = normalizeFreelancerName(r.name);
      const data = {
        name,
        comment: r.comment,
        active: r.active,
      };
      try {
        if (r.id) {
          const existing = await prisma.freelancer.findUnique({
            where: { id: r.id },
            select: { id: true },
          });
          if (existing) {
            await prisma.freelancer.update({ where: { id: r.id }, data });
            updated += 1;
            continue;
          }
        }
        const byName = await findFreelancerByName(prisma, name);
        if (byName) {
          await prisma.freelancer.update({
            where: { id: byName.id },
            data: { comment: data.comment, active: data.active },
          });
          updated += 1;
          continue;
        }
        await prisma.freelancer.create({ data });
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
    console.error("[POST /api/freelancers/csv]", e);
    return NextResponse.json(
      { error: "Не удалось импортировать" },
      { status: 500 },
    );
  }
}
