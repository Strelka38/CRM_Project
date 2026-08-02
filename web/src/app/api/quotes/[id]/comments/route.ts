import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyWorkersOfChatMessage } from "@/lib/notifications";
import { canAccessQuote } from "@/lib/quote-access";
import { requireSession } from "@/lib/session";

const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

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
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });
    return NextResponse.json(comments);
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

    const body = postSchema.parse(await req.json());
    const comment = await prisma.quoteComment.create({
      data: {
        quoteId: id,
        authorId: session.user.id,
        body: body.body,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    await notifyWorkersOfChatMessage({
      quoteId: id,
      authorId: session.user.id,
      authorName: comment.author.name || "Участник",
      message: body.body,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
