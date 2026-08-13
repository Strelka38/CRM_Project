import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess } from "@/lib/session";
import { resolveUploadPath } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ itemId: string; docId: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { itemId, docId } = await params;

    const doc = await prisma.equipmentDocument.findFirst({
      where: { id: docId, catalogItemId: itemId },
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
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
