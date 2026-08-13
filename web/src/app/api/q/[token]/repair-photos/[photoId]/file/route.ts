import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { resolveUploadPath } from "@/lib/uploads";

/** Фото поломки: любой авторизованный пользователь, если фото этой единицы. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; photoId: string }> },
) {
  try {
    await requireSession();
    const { token, photoId } = await params;
    const unit = await prisma.equipmentUnit.findFirst({
      where: { qrToken: token, active: true },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photo = await prisma.equipmentRepairPhoto.findFirst({
      where: { id: photoId, repair: { unitId: unit.id } },
    });
    if (!photo) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(photo.storagePath);
    const data = await readFile(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(photo.filename)}`,
        "Content-Length": String(photo.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
