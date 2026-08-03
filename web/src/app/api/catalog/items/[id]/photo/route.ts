import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess, requireSession } from "@/lib/session";
import {
  deleteUploadFile,
  IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  mimeFromStoragePath,
  resolveUploadMime,
  resolveUploadPath,
  saveCatalogItemPhoto,
} from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const item = await prisma.catalogItem.findUnique({
      where: { id },
      select: { photoPath: true, name: true },
    });
    if (!item?.photoPath) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(item.photoPath);
    const data = await readFile(abs);
    const mime = mimeFromStoragePath(item.photoPath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(item.name)}.${mime.includes("png") ? "png" : "jpg"}`,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id } = await params;
    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    const mimeType = resolveUploadMime(file);
    if (!mimeType || !IMAGE_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: "Допустимы png и jpg" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Файл больше 15 МБ" },
        { status: 400 },
      );
    }

    if (item.photoPath) {
      await deleteUploadFile(item.photoPath);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { storagePath } = await saveCatalogItemPhoto(id, mimeType, buf);
    const updated = await prisma.catalogItem.update({
      where: { id },
      data: { photoPath: storagePath },
      include: { category: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id } = await params;
    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (item.photoPath) {
      await deleteUploadFile(item.photoPath);
    }
    const updated = await prisma.catalogItem.update({
      where: { id },
      data: { photoPath: null },
      include: { category: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
