import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

const changePasswordSchema = z
  .object({
    email: z.string().email(),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = changePasswordSchema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    if (email !== session.user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Можно сменить только свой пароль" },
        { status: 403 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, passwordHash: true, active: true },
    });

    if (!user || !user.active) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (user.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: "Можно сменить только свой пароль" },
        { status: 403 },
      );
    }

    const currentOk = await bcrypt.compare(
      body.currentPassword,
      user.passwordHash,
    );
    if (!currentOk) {
      return NextResponse.json(
        { error: "Неверный текущий пароль" },
        { status: 400 },
      );
    }

    if (body.currentPassword === body.newPassword) {
      return NextResponse.json(
        { error: "Новый пароль должен отличаться от текущего" },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 10) },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      const confirmIssue = e.issues.find((i) => i.path[0] === "confirmPassword");
      return NextResponse.json(
        {
          error:
            confirmIssue?.message ||
            e.issues[0]?.message ||
            "Некорректные данные",
        },
        { status: 400 },
      );
    }
    console.error("POST /api/me/password", e);
    return NextResponse.json(
      { error: "Не удалось сменить пароль" },
      { status: 500 },
    );
  }
}
