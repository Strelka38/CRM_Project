import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveUploadPath } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ token: string; docId: string }> },
) {
  try {
    const { token, docId } = await params;
    const unit = await prisma.equipmentUnit.findFirst({
      where: { qrToken: token, active: true },
      select: {
        catalogItemId: true,
        catalogItem: { select: { active: true } },
      },
    });
    if (!unit || !unit.catalogItem.active) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const doc = await prisma.equipmentDocument.findFirst({
      where: { id: docId, catalogItemId: unit.catalogItemId },
    });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(doc.storagePath);
    const data = await readFile(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
        "Content-Length": String(doc.size),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
