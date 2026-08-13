import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRepairsAccess } from "@/lib/session";
import { resolveUploadPath } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requireRepairsAccess();
    const { id, photoId } = await params;
    const photo = await prisma.equipmentRepairPhoto.findFirst({
      where: { id: photoId, repairId: id },
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
