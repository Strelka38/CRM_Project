import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchRemoteImage, RemoteImageError } from "@/lib/remote-image";
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
    const ext = path.extname(item.photoPath).replace(".", "") || "jpg";
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(item.name)}.${ext}`,
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

    const contentType = req.headers.get("content-type") || "";
    let mimeType = "";
    let buf: Buffer;

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
      const url = typeof body?.url === "string" ? body.url : "";
      if (!url.trim()) {
        return NextResponse.json({ error: "Вставьте ссылку" }, { status: 400 });
      }
      const image = await fetchRemoteImage(url);
      mimeType = image.mimeType;
      buf = image.data;
    } else {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
      }
      const resolved = resolveUploadMime(file);
      if (!resolved || !IMAGE_MIME.has(resolved)) {
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
      mimeType = resolved;
      buf = Buffer.from(await file.arrayBuffer());
    }

    if (item.photoPath) {
      await deleteUploadFile(item.photoPath);
    }

    const { storagePath } = await saveCatalogItemPhoto(id, mimeType, buf);
    const updated = await prisma.catalogItem.update({
      where: { id },
      data: { photoPath: storagePath },
      include: { category: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof RemoteImageError || (e instanceof Error && e.name === "RemoteImageError")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
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
