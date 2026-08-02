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
  }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = await requireSession();
    const { id, attachmentId } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const attachment = await prisma.quoteAttachment.findFirst({
      where: { id: attachmentId, quoteId: id },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const abs = resolveUploadPath(attachment.storagePath);
    const data = await readFile(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Content-Length": String(attachment.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
