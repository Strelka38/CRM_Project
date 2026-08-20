import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { clearInvoiceDueNotifications } from "@/lib/notifications";
import { canAccessQuote } from "@/lib/quote-access";
import { requireManager } from "@/lib/session";

const attachmentSelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  createdAt: true,
  invoiceSent: true,
  uploader: { select: { id: true, name: true } },
} as const;

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      throw e;
    });
  }
  return ensureOnce;
}

const patchSchema = z.object({
  invoiceSent: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = await requireManager();
    await ensureSchemaOnce();
    const { id, attachmentId } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = patchSchema.parse(await req.json());
    const attachment = await prisma.quoteAttachment.findFirst({
      where: { id: attachmentId, quoteId: id },
      select: { id: true },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      if (body.invoiceSent) {
        await tx.quoteAttachment.updateMany({
          where: { quoteId: id, invoiceSent: true },
          data: { invoiceSent: false },
        });
        await tx.quoteAttachment.update({
          where: { id: attachmentId },
          data: { invoiceSent: true },
        });
        await tx.quote.update({
          where: { id },
          data: { invoiceSent: true },
        });
        return;
      }

      await tx.quoteAttachment.update({
        where: { id: attachmentId },
        data: { invoiceSent: false },
      });
      const quote = await tx.quote.findUnique({
        where: { id },
        select: { paid: true },
      });
      if (!quote?.paid) {
        await tx.quote.update({
          where: { id },
          data: { invoiceSent: false },
        });
      }
    });

    if (body.invoiceSent) {
      await clearInvoiceDueNotifications(id);
    }

    const updated = await prisma.quoteAttachment.findFirst({
      where: { id: attachmentId, quoteId: id },
      select: attachmentSelect,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
