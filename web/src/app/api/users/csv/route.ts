import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getMasterTimezone } from "@/lib/app-settings";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  USER_CSV_HEADERS,
  parseUserCsv,
  userToCsvCells,
} from "@/lib/directory-csv";
import {
  canAssignRole,
  requireDatabaseAccess,
} from "@/lib/session";
import type { AppRole } from "@/lib/roles";

export async function GET() {
  try {
    await requireDatabaseAccess();
    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        phone: true,
        comment: true,
        role: true,
        monthlySalary: true,
        agencyPercent: true,
        owners: true,
        active: true,
        specialties: {
          include: { specialty: { select: { name: true } } },
        },
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvFileResponse(`users-${stamp}.csv`, [
      [...USER_CSV_HEADERS],
      ...users.map((u) =>
        userToCsvCells({
          ...u,
          role: u.role as AppRole,
          comment: u.comment,
        }),
      ),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/users/csv]", e);
    return NextResponse.json({ error: "Не удалось экспортировать" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireDatabaseAccess();
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;
    const { rows, errors } = parseUserCsv(uploaded.text);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "Нет строк для импорта", errors, created: 0, updated: 0 },
        { status: 400 },
      );
    }

    const specialties = await prisma.specialty.findMany({
      select: { id: true, name: true },
    });
    const specByName = new Map(
      specialties.map((s) => [s.name.trim().toLowerCase(), s.id]),
    );
    const timezone = await getMasterTimezone();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const rowErrors = [...errors];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lineNo = i + 2;
      try {
        const role: AppRole = r.role ?? "EMPLOYEE";
        if (!canAssignRole(session.user.role, role)) {
          rowErrors.push(`Строка ${lineNo}: нельзя назначить роль ${role}`);
          skipped += 1;
          continue;
        }

        const byId = r.id
          ? await prisma.user.findUnique({ where: { id: r.id }, select: { id: true } })
          : null;
        const byEmail = await prisma.user.findUnique({
          where: { email: r.email },
          select: { id: true },
        });
        const existingId = byId?.id || byEmail?.id;
        const specIds = r.specialties
          .map((name) => specByName.get(name.toLowerCase()))
          .filter((id): id is string => Boolean(id));

        if (existingId) {
          await prisma.user.update({
            where: { id: existingId },
            data: {
              email: r.email,
              name: r.name,
              lastName: r.lastName,
              firstName: r.firstName,
              patronymic: r.patronymic,
              phone: r.phone,
              comment: r.comment,
              role,
              monthlySalary: r.monthlySalary,
              agencyPercent: r.agencyPercent,
              owners: r.owners,
              active: r.active,
              ...(r.password && r.password.length >= 6
                ? { passwordHash: await bcrypt.hash(r.password, 10) }
                : {}),
            },
          });
          if (r.specialties.length) {
            await prisma.userSpecialty.deleteMany({ where: { userId: existingId } });
            if (specIds.length) {
              await prisma.userSpecialty.createMany({
                data: specIds.map((specialtyId) => ({
                  userId: existingId,
                  specialtyId,
                })),
              });
            }
          }
          updated += 1;
          continue;
        }

        if (!r.password || r.password.length < 6) {
          rowErrors.push(
            `Строка ${lineNo}: для нового пользователя нужен пароль ≥ 6 символов (колонка «Пароль»)`,
          );
          skipped += 1;
          continue;
        }

        const user = await prisma.user.create({
          data: {
            email: r.email,
            name: r.name,
            lastName: r.lastName,
            firstName: r.firstName,
            patronymic: r.patronymic,
            phone: r.phone,
            comment: r.comment,
            role,
            monthlySalary: r.monthlySalary,
            agencyPercent: r.agencyPercent,
            owners: r.owners,
            active: r.active,
            passwordHash: await bcrypt.hash(r.password, 10),
            timezone,
          },
        });
        if (specIds.length) {
          await prisma.userSpecialty.createMany({
            data: specIds.map((specialtyId) => ({
              userId: user.id,
              specialtyId,
            })),
          });
        }
        created += 1;
      } catch (err) {
        rowErrors.push(
          `Строка ${lineNo}: ${err instanceof Error ? err.message : "ошибка"}`,
        );
      }
    }

    return NextResponse.json({
      created,
      updated,
      skipped,
      total: rows.length,
      errors: rowErrors.slice(0, 50),
      errorCount: rowErrors.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/users/csv]", e);
    return NextResponse.json({ error: "Не удалось импортировать" }, { status: 500 });
  }
}
