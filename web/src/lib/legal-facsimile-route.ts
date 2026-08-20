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
  saveLegalEntityImage,
} from "@/lib/uploads";

type FacsimileKind = "seal" | "signature";

export async function handleFacsimileGet(
  id: string,
  kind: FacsimileKind,
) {
  await requireSession();
  const entity = await prisma.legalEntity.findUnique({
    where: { id },
    select: { shortName: true, sealPath: true, signaturePath: true },
  });
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const storagePath = kind === "seal" ? entity.sealPath : entity.signaturePath;
  if (!storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const abs = resolveUploadPath(storagePath);
  const data = await readFile(abs);
  const mime = mimeFromStoragePath(storagePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(entity.shortName)}-${kind}.png`,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, max-age=60",
    },
  });
}

export async function handleFacsimilePost(
  req: NextRequest,
  id: string,
  kind: FacsimileKind,
) {
  await requireDatabaseAccess();
  const entity = await prisma.legalEntity.findUnique({ where: { id } });
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
  }
  const mimeType = resolveUploadMime(file);
  if (!mimeType || !IMAGE_MIME.has(mimeType)) {
    return NextResponse.json({ error: "Допустимы png и jpg" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Файл больше 15 МБ" }, { status: 400 });
  }

  const prev = kind === "seal" ? entity.sealPath : entity.signaturePath;
  if (prev) await deleteUploadFile(prev);
  const buf = Buffer.from(await file.arrayBuffer());
  const { storagePath } = await saveLegalEntityImage(id, kind, mimeType, buf);
  const updated = await prisma.legalEntity.update({
    where: { id },
    data: kind === "seal" ? { sealPath: storagePath } : { signaturePath: storagePath },
    include: {
      bankAccounts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  return NextResponse.json(updated);
}

export async function handleFacsimileDelete(id: string, kind: FacsimileKind) {
  await requireDatabaseAccess();
  const entity = await prisma.legalEntity.findUnique({ where: { id } });
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const prev = kind === "seal" ? entity.sealPath : entity.signaturePath;
  if (prev) await deleteUploadFile(prev);
  const updated = await prisma.legalEntity.update({
    where: { id },
    data: kind === "seal" ? { sealPath: null } : { signaturePath: null },
    include: {
      bankAccounts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  return NextResponse.json(updated);
}
