import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeOffEquipmentUnit } from "@/lib/equipment";
import { requireDatabaseAccess } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { unitId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      label?: string | null;
      writeOff?: boolean;
      reason?: string;
      comment?: string;
    };

    const unit = await prisma.equipmentUnit.findUnique({
      where: { id: unitId },
      select: { id: true, active: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.writeOff) {
      const reason = body.reason === "LOST" ? "LOST" : body.reason === "DAMAGED" ? "DAMAGED" : "";
      if (!reason) {
        return NextResponse.json(
          { error: "Укажите причину: повреждено или утеряно" },
          { status: 400 },
        );
      }
      if (!unit.active) {
        return NextResponse.json({ error: "Единица уже списана" }, { status: 409 });
      }
      try {
        await writeOffEquipmentUnit({
          unitId,
          reason,
          comment: String(body.comment || "").trim(),
        });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        throw e;
      }
      return NextResponse.json({ ok: true });
    }

    if ("label" in body) {
      const label =
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim()
          : null;
      const updated = await prisma.equipmentUnit.update({
        where: { id: unitId },
        data: { label },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Нечего обновить" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/equipment/units/id]", e);
    return NextResponse.json(
      { error: "Не удалось обновить единицу" },
      { status: 500 },
    );
  }
}
