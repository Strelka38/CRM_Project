import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";
import {
  IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
  saveVenuePhoto,
} from "@/lib/uploads";

const MAX_PHOTOS = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { id: true, _count: { select: { photos: true } } },
    });
    if (!venue) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (venue._count.photos >= MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Не больше ${MAX_PHOTOS} фото на площадку` },
        { status: 400 },
      );
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

    const buf = Buffer.from(await file.arrayBuffer());
    const { storagePath, filename } = await saveVenuePhoto(id, mimeType, buf);
    const maxOrder = await prisma.venuePhoto.aggregate({
      where: { venueId: id },
      _max: { sortOrder: true },
    });
    const photo = await prisma.venuePhoto.create({
      data: {
        venueId: id,
        filename: file.name || filename,
        mimeType,
        size: file.size,
        storagePath,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        sortOrder: true,
        createdAt: true,
      },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
