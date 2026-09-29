import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendUnitToRepair } from "@/lib/equipment-repair-ops";
import {
  isEquipmentFaultType,
} from "@/lib/equipment-repairs";
import { canSendEquipmentToRepair, requireSession } from "@/lib/session";
import {
  IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
  saveEquipmentRepairPhoto,
} from "@/lib/uploads";

const MAX_PHOTOS = 8;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const session = await requireSession();
    if (!canSendEquipmentToRepair(session.user.role, session.permissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { token } = await params;
    const unit = await prisma.equipmentUnit.findFirst({
      where: { qrToken: token, active: true },
      select: { id: true, inRepair: true, catalogItem: { select: { active: true } } },
    });
    if (!unit || !unit.catalogItem.active) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (unit.inRepair) {
      return NextResponse.json(
        { error: "Единица уже в ремонте" },
        { status: 409 },
      );
    }

    const form = await req.formData();
    const faultTypeRaw = String(form.get("faultType") || "").trim();
    if (!isEquipmentFaultType(faultTypeRaw)) {
      return NextResponse.json(
        { error: "Укажите тип поломки" },
        { status: 400 },
      );
    }
    const comment = String(form.get("comment") || "").trim();

    const files = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Не больше ${MAX_PHOTOS} фото` },
        { status: 400 },
      );
    }

    for (const file of files) {
      const mime = resolveUploadMime(file);
      if (!mime || !IMAGE_MIME.has(mime)) {
        return NextResponse.json(
          { error: "К поломке можно приложить только jpg/png" },
          { status: 400 },
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Файл больше 15 МБ" }, { status: 400 });
      }
    }

    let repair;
    try {
      repair = await sendUnitToRepair({
        unitId: unit.id,
        userId: session.user.id,
        faultType: faultTypeRaw,
        comment,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "ALREADY_IN_REPAIR") {
        return NextResponse.json(
          { error: "Единица уже в ремонте" },
          { status: 409 },
        );
      }
      if (e instanceof Error && e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }

    for (const file of files) {
      const mimeType = resolveUploadMime(file);
      const buf = Buffer.from(await file.arrayBuffer());
      const { storagePath } = await saveEquipmentRepairPhoto(
        repair.id,
        mimeType,
        buf,
      );
      await prisma.equipmentRepairPhoto.create({
        data: {
          repairId: repair.id,
          filename: file.name || "photo.jpg",
          mimeType,
          size: file.size,
          storagePath,
        },
      });
    }

    return NextResponse.json({ ok: true, repairId: repair.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/q/token/repair]", e);
    return NextResponse.json(
      { error: "Не удалось списать в ремонт" },
      { status: 500 },
    );
  }
}
