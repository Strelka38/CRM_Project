import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessQuote } from "@/lib/quote-access";
import { requireManager, requireSession } from "@/lib/session";
import {
  deleteUploadFile,
  isAllowedMime,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
  saveQuoteUpload,
} from "@/lib/uploads";

const attachmentSelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploader: { select: { id: true, name: true } },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachments = await prisma.quoteAttachment.findMany({
      where: { quoteId: id },
      orderBy: { createdAt: "desc" },
      select: attachmentSelect,
    });
    return NextResponse.json(attachments);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
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

    const buf = Buffer.from(await file.arrayBuffer());
    const { storagePath } = await saveQuoteUpload(id, mimeType, buf);

    const attachment = await prisma.quoteAttachment.create({
      data: {
        quoteId: id,
        uploaderId: session.user.id,
        filename: file.name || "file",
        mimeType,
        size: file.size,
        storagePath,
      },
      select: attachmentSelect,
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachmentId = new URL(req.url).searchParams.get("attachmentId");
    if (!attachmentId) {
      return NextResponse.json(
        { error: "attachmentId required" },
        { status: 400 },
      );
    }

    const attachment = await prisma.quoteAttachment.findFirst({
      where: { id: attachmentId, quoteId: id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await deleteUploadFile(attachment.storagePath);
    await prisma.quoteAttachment.delete({ where: { id: attachment.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
