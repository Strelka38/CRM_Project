import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessQuote } from "@/lib/quote-access";
import { requireSession } from "@/lib/session";
import { resolveUploadPath } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const session = await requireSession();
    const { id, commentId } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const comment = await prisma.quoteComment.findFirst({
      where: { id: commentId, quoteId: id },
      select: {
        imagePath: true,
        imageMime: true,
        imageName: true,
      },
    });
    if (!comment?.imagePath || !comment.imageMime) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(comment.imagePath);
    const data = await readFile(abs);
    const filename = comment.imageName || "image";
    return new NextResponse(data, {
      headers: {
        "Content-Type": comment.imageMime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
