import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess, requireSession } from "@/lib/session";
import {
  deleteUploadFile,
  mimeFromStoragePath,
  resolveUploadPath,
} from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requireSession();
    const { id, photoId } = await params;
    const photo = await prisma.venuePhoto.findFirst({
      where: { id: photoId, venueId: id },
    });
    if (!photo) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(photo.storagePath);
    const data = await readFile(abs);
    const mime = mimeFromStoragePath(photo.storagePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(photo.filename)}`,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id, photoId } = await params;
    const photo = await prisma.venuePhoto.findFirst({
      where: { id: photoId, venueId: id },
    });
    if (!photo) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteUploadFile(photo.storagePath);
    await prisma.venuePhoto.delete({ where: { id: photoId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
