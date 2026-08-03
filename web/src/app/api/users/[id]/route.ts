import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { calcAssignmentPay } from "@/lib/payroll";
import { requireSession } from "@/lib/session";

const companyEnum = z.enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]);

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
  owners: true,
  createdAt: true,
  updatedAt: true,
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
    if (session.user.role !== "MANAGER" && session.user.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
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
      .filter((r) => ["CONFIRMED", "COMPLETED"].includes(r.quote.lifecycle))
      .reduce((s, r) => s + r.pay, 0);

    return NextResponse.json({ ...user, payrollRows, estimatedSalary });
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
  phone: z.string().optional(),
  comment: z.string().optional(),
  role: z.enum(["MANAGER", "EMPLOYEE", "BRIGADIER"]).optional(),
  active: z.boolean().optional(),
  monthlySalary: z.number().nonnegative().optional(),
  owners: z.array(companyEnum).max(3).optional(),
  password: z.string().min(6).optional(),
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
    const isManager = session.user.role === "MANAGER";
    const isSelf = session.user.id === id;
    if (!isManager && !isSelf) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = patchSchema.parse(await req.json());
    if (
      !isManager &&
      (body.role !== undefined ||
        body.active !== undefined ||
        body.monthlySalary !== undefined ||
        body.owners !== undefined ||
        body.password !== undefined)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: {
      name?: string;
      firstName?: string;
      lastName?: string;
      patronymic?: string;
      phone?: string;
      comment?: string;
      role?: "MANAGER" | "EMPLOYEE" | "BRIGADIER";
      active?: boolean;
      monthlySalary?: number;
      owners?: CatalogOwnerValue[];
      passwordHash?: string;
    } = {};

    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.patronymic !== undefined) data.patronymic = body.patronymic;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.comment !== undefined) data.comment = body.comment;
    if (isManager && body.role !== undefined) data.role = body.role;
    if (isManager && body.active !== undefined) data.active = body.active;
    if (isManager && body.monthlySalary !== undefined) {
      data.monthlySalary = body.monthlySalary;
    }
    if (isManager && body.owners !== undefined) {
      data.owners = normalizeOwners(body.owners);
    }
    if (isManager && body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 10);
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
    throw e;
  }
}
