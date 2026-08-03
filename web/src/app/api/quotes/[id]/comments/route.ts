import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyWorkersOfChatMessage } from "@/lib/notifications";
import { canAccessQuote } from "@/lib/quote-access";
import { requireSession } from "@/lib/session";
import {
  IMAGE_MIME,
  isAllowedMime,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
  saveQuoteUpload,
} from "@/lib/uploads";

const commentSelect = {
  id: true,
  body: true,
  imagePath: true,
  imageMime: true,
  imageName: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
} as const;

function serializeComment(c: {
  id: string;
  body: string;
  imagePath: string | null;
  imageMime: string | null;
  imageName: string | null;
  createdAt: Date;
  author: { id: string; name: string; role: string };
}) {
  return {
    id: c.id,
    body: c.body,
    hasImage: Boolean(c.imagePath),
    imageMime: c.imageMime,
    imageName: c.imageName,
    createdAt: c.createdAt,
    author: c.author,
  };
}

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

    const comments = await prisma.quoteComment.findMany({
      where: { quoteId: id },
      orderBy: { createdAt: "asc" },
      select: commentSelect,
    });
    return NextResponse.json(comments.map(serializeComment));
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
    const session = await requireSession();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") || "";
    let bodyText = "";
    let imagePath: string | null = null;
    let imageMime: string | null = null;
    let imageName: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      bodyText = String(form.get("body") ?? "").trim();
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        const mime = resolveUploadMime(file);
        if (!mime || !IMAGE_MIME.has(mime) || !isAllowedMime(mime)) {
          return NextResponse.json(
            { error: "В чат можно прикрепить только png или jpg" },
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
        const saved = await saveQuoteUpload(id, mime, buf);
        imagePath = saved.storagePath;
        imageMime = mime;
        imageName = file.name || "image";
      }
    } else {
      const parsed = z
        .object({ body: z.string().trim().max(4000) })
        .parse(await req.json());
      bodyText = parsed.body;
    }

    if (!bodyText && !imagePath) {
      return NextResponse.json(
        { error: "Напишите сообщение или прикрепите картинку" },
        { status: 400 },
      );
    }
    if (bodyText.length > 4000) {
      return NextResponse.json(
        { error: "Сообщение слишком длинное" },
        { status: 400 },
      );
    }

    const comment = await prisma.quoteComment.create({
      data: {
        quoteId: id,
        authorId: session.user.id,
        body: bodyText,
        imagePath,
        imageMime,
        imageName,
      },
      select: commentSelect,
    });

    await notifyWorkersOfChatMessage({
      quoteId: id,
      authorId: session.user.id,
      authorName: comment.author.name || "Участник",
      message: bodyText || (imageName ? `📷 ${imageName}` : "📷 Фото"),
    });

    return NextResponse.json(serializeComment(comment), { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/quotes/[id]/comments", e);
    return NextResponse.json(
      { error: "Не удалось отправить сообщение" },
      { status: 500 },
    );
  }
}
