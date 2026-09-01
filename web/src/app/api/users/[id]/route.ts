import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { appRoleZod, catalogOwnerZod } from "@/lib/zod-enums";
import { isStatsLifecycle } from "@/lib/lifecycle";
import { calcAssignmentPay } from "@/lib/payroll";
import { isAdmin, isManager } from "@/lib/roles";
import {
  canAccessDatabase,
  canAssignRole,
  canEditUserRole,
  requireSession,
} from "@/lib/session";
import { isKnownTimezone } from "@/lib/timezone";

const companyEnum = catalogOwnerZod;

const userSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  patronymic: true,
  phone: true,
  comment: true,
  role: true,
  active: true,
  monthlySalary: true,
  agencyPercent: true,
  owners: true,
  timezone: true,
  weatherPlace: true,
  canAccessPayments: true,
  createdAt: true,
  updatedAt: true,
} as const;

const userWithSpecialtiesSelect = {
  ...userSelect,
  specialties: {
    include: { specialty: true },
    orderBy: { specialty: { sortOrder: "asc" as const } },
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const dbAccess = canAccessDatabase(session.user.role);
    if (!dbAccess && session.user.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: userWithSpecialtiesSelect,
    });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const assignments = await prisma.quoteAssignment.findMany({
      where: { userId: id },
      include: {
        specialty: { select: { id: true, name: true } },
        quote: {
          select: {
            id: true,
            eventName: true,
            date: true,
            lifecycle: true,
          },
        },
      },
    });

    const rateMap = new Map(
      user.specialties.map((s) => [
        s.specialtyId,
        { hourlyRate: s.hourlyRate, shiftRate: s.shiftRate },
      ]),
    );

    const payrollRows = assignments.map((a) => {
      const rates = rateMap.get(a.specialtyId) || {
        hourlyRate: 0,
        shiftRate: 0,
      };
      return {
        id: a.id,
        specialty: a.specialty,
        payMode: a.payMode,
        hours: a.hours,
        rateOverride: a.rateOverride,
        pay: calcAssignmentPay({
          payMode: a.payMode,
          hours: a.hours,
          rateOverride: a.rateOverride,
          ...rates,
        }),
        quote: a.quote,
      };
    });

    const estimatedSalary = payrollRows
      .filter((r) => isStatsLifecycle(r.quote.lifecycle))
      .reduce((s, r) => s + r.pay, 0);

    const payoutHistory = dbAccess
      ? await prisma.payout.findMany({
          where: { userId: id, paid: true },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: 100,
          include: { paidBy: { select: { name: true } } },
        })
      : [];

    return NextResponse.json({
      ...user,
      payrollRows,
      estimatedSalary,
      payoutHistory: payoutHistory.map((p) => ({
        id: p.id,
        kind: p.kind,
        periodYm: p.periodYm,
        amount: p.amount,
        paidAt: p.paidAt,
        paidByName: p.paidBy?.name ?? null,
        quoteId: p.quoteId,
      })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  patronymic: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  comment: z.string().optional(),
  role: appRoleZod.optional(),
  active: z.boolean().optional(),
  monthlySalary: z.number().nonnegative().optional(),
  agencyPercent: z.number().min(0).max(100).optional(),
  owners: z.array(companyEnum).max(3).optional(),
  password: z.string().min(6).optional(),
  timezone: z.string().min(1).optional(),
  weatherPlace: z.enum(["IRKUTSK", "IRKUTSK_OBLAST"]).optional(),
  canAccessPayments: z.boolean().optional(),
});

function displayName(parts: {
  lastName?: string;
  firstName?: string;
  patronymic?: string;
  name?: string;
}) {
  const fio = [parts.lastName, parts.firstName, parts.patronymic]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(" ");
  return fio || parts.name || "";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const dbAccess = canAccessDatabase(session.user.role);
    const isSelf = session.user.id === id;
    if (!dbAccess && !isSelf) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = patchSchema.parse(await req.json());
    if (
      !dbAccess &&
      (body.role !== undefined ||
        body.active !== undefined ||
        body.monthlySalary !== undefined ||
        body.owners !== undefined ||
        body.password !== undefined)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.password !== undefined && !isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.agencyPercent !== undefined && !isManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.canAccessPayments !== undefined && !isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.email !== undefined && !isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.role !== undefined) {
      if (
        !canEditUserRole(session.user.role, existing.role) ||
        !canAssignRole(session.user.role, body.role)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const leavingAdmin =
      existing.role === "ADMIN" &&
      ((body.role !== undefined && body.role !== "ADMIN") ||
        body.active === false);
    if (leavingAdmin) {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Нельзя снять или отключить последнего администратора" },
          { status: 400 },
        );
      }
    }

    const data: {
      name?: string;
      firstName?: string;
      lastName?: string;
      patronymic?: string;
      email?: string;
      phone?: string;
      comment?: string;
      role?: "ADMIN" | "MANAGER" | "EMPLOYEE" | "BRIGADIER";
      active?: boolean;
      monthlySalary?: number;
      agencyPercent?: number;
      owners?: CatalogOwnerValue[];
      passwordHash?: string;
      timezone?: string;
      weatherPlace?: "IRKUTSK" | "IRKUTSK_OBLAST";
      canAccessPayments?: boolean;
    } = {};

    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.patronymic !== undefined) data.patronymic = body.patronymic;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.comment !== undefined) data.comment = body.comment;
    if (dbAccess && body.role !== undefined) data.role = body.role;
    if (dbAccess && body.active !== undefined) data.active = body.active;
    if (dbAccess && body.monthlySalary !== undefined) {
      data.monthlySalary = body.monthlySalary;
    }
    if (
      isManager(session.user.role) &&
      body.agencyPercent !== undefined
    ) {
      data.agencyPercent = body.agencyPercent;
    }
    if (dbAccess && body.owners !== undefined) {
      data.owners = normalizeOwners(body.owners);
    }
    if (isAdmin(session.user.role) && body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }
    if (body.timezone !== undefined) {
      if (!isKnownTimezone(body.timezone)) {
        return NextResponse.json(
          { error: "Неизвестный часовой пояс" },
          { status: 400 },
        );
      }
      data.timezone = body.timezone;
    }
    if (body.weatherPlace !== undefined) {
      data.weatherPlace = body.weatherPlace;
    }
    if (isAdmin(session.user.role) && body.canAccessPayments !== undefined) {
      data.canAccessPayments = body.canAccessPayments;
    }
    if (isAdmin(session.user.role) && body.email !== undefined) {
      const email = body.email.toLowerCase().trim();
      if (email !== existing.email.toLowerCase()) {
        const taken = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json(
            { error: "Этот email уже занят" },
            { status: 409 },
          );
        }
        data.email = email;
      }
    }

    if (
      body.name !== undefined ||
      body.firstName !== undefined ||
      body.lastName !== undefined ||
      body.patronymic !== undefined
    ) {
      data.name =
        body.name ??
        displayName({
          lastName: body.lastName ?? existing.lastName,
          firstName: body.firstName ?? existing.firstName,
          patronymic: body.patronymic ?? existing.patronymic,
          name: existing.name,
        });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: "Этот email уже занят" },
        { status: 409 },
      );
    }
    throw e;
  }
}
