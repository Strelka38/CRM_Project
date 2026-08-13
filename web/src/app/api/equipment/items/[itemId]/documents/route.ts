import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess } from "@/lib/session";
import {
  deleteUploadFile,
  isAllowedMime,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
  saveEquipmentDocument,
} from "@/lib/uploads";

const docSelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  description: true,
  createdAt: true,
  uploader: { select: { id: true, name: true } },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { itemId } = await params;
    const item = await prisma.catalogItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const docs = await prisma.equipmentDocument.findMany({
      where: { catalogItemId: itemId },
      orderBy: { createdAt: "desc" },
      select: docSelect,
    });
    return NextResponse.json(docs);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const session = await requireDatabaseAccess();
    const { itemId } = await params;
    const item = await prisma.catalogItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    const mimeType = resolveUploadMime(file);
    if (!mimeType || !isAllowedMime(mimeType)) {
      return NextResponse.json(
        { error: "Допустимы pdf, excel, png, jpg" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Файл больше 15 МБ" },
        { status: 400 },
      );
    }

    const descriptionRaw = form.get("description");
    const description =
      typeof descriptionRaw === "string" && descriptionRaw.trim()
        ? descriptionRaw.trim()
        : null;

    const buf = Buffer.from(await file.arrayBuffer());
    const { storagePath } = await saveEquipmentDocument(itemId, mimeType, buf);

    const doc = await prisma.equipmentDocument.create({
      data: {
        catalogItemId: itemId,
        uploaderId: session.user.id,
        filename: file.name || "file",
        mimeType,
        size: file.size,
        storagePath,
        description,
      },
      select: docSelect,
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { itemId } = await params;
    const docId = req.nextUrl.searchParams.get("docId")?.trim();
    if (!docId) {
      return NextResponse.json({ error: "docId обязателен" }, { status: 400 });
    }

    const doc = await prisma.equipmentDocument.findFirst({
      where: { id: docId, catalogItemId: itemId },
    });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.equipmentDocument.delete({ where: { id: doc.id } });
    await deleteUploadFile(doc.storagePath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
