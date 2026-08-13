import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mimeFromStoragePath, resolveUploadPath } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const unit = await prisma.equipmentUnit.findFirst({
      where: { qrToken: token, active: true },
      include: {
        catalogItem: {
          select: { photoPath: true, active: true, name: true },
        },
      },
    });
    if (!unit || !unit.catalogItem.active || !unit.catalogItem.photoPath) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(unit.catalogItem.photoPath);
    const data = await readFile(abs);
    const mime = mimeFromStoragePath(unit.catalogItem.photoPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
