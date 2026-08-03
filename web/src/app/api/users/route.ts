import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canManageAssignments,
  isManager,
  requireManager,
  requireSession,
} from "@/lib/session";

export async function GET() {
  try {
    const session = await requireSession();
    if (!canManageAssignments(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const managerView = isManager(session.user.role);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        patronymic: true,
        phone: true,
        role: true,
        active: true,
        monthlySalary: managerView,
        owners: true,
        createdAt: true,
        updatedAt: true,
        specialties: {
          include: { specialty: { select: { id: true, name: true } } },
        },
        _count: { select: { assignments: true } },
      },
    });
    return NextResponse.json(users);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/users", e);
    return NextResponse.json(
      { error: "Не удалось загрузить пользователей" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  patronymic: z.string().optional(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["MANAGER", "EMPLOYEE", "BRIGADIER"]).default("EMPLOYEE"),
});

export async function POST(req: NextRequest) {
  try {
    await requireManager();
    const body = createSchema.parse(await req.json());
    const fio = [body.lastName, body.firstName, body.patronymic]
      .map((x) => (x || "").trim())
      .filter(Boolean)
      .join(" ");
    const name = fio || body.name || body.email;

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name,
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        patronymic: body.patronymic || "",
        phone: body.phone || "",
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        patronymic: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Не удалось создать пользователя (возможно, email занят)" },
      { status: 400 },
    );
  }
}
