import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { returnUnitFromRepair } from "@/lib/equipment-repair-ops";
import { requireRepairsAccess } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRepairsAccess();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      resolve?: boolean;
      resolutionComment?: string;
    };
    if (!body.resolve) {
      return NextResponse.json({ error: "Укажите resolve: true" }, { status: 400 });
    }
    const resolutionComment = String(body.resolutionComment || "").trim();
    if (!resolutionComment) {
      return NextResponse.json(
        { error: "Напишите заключение сервиса" },
        { status: 400 },
      );
    }

    const existing = await prisma.equipmentRepair.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.status !== "OPEN") {
      return NextResponse.json({ error: "Заявка уже закрыта" }, { status: 409 });
    }

    try {
      await returnUnitFromRepair({
        repairId: id,
        userId: session.user.id,
        resolutionComment,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/repairs/id]", e);
    return NextResponse.json(
      { error: "Не удалось вернуть из ремонта" },
      { status: 500 },
    );
  }
}
