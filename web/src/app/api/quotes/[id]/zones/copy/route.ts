import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAccessibleQuote } from "@/lib/quote-access";
import { toPrismaDayMode } from "@/lib/quote-calc";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireManager } from "@/lib/session";
import { parseZonePricing } from "@/lib/zone-pricing";

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

const blockSchema = z.object({
  type: z.enum(["SECTION", "ITEM", "NOTE", "KIT_HEADER"]),
  sortOrder: z.number().int().optional(),
  title: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  qty: z.number().optional(),
  unitPrice: z.number().optional(),
  cashlessOverride: z.number().nullable().optional(),
  dayMode: z.string().optional(),
  dayCoefOverride: z.number().nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
  kitId: z.string().nullable().optional(),
});

const bodySchema = z.object({
  targetQuoteId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional(),
  pricing: z.unknown().optional(),
  blocks: z.array(blockSchema).max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    await ensureSchemaOnce();
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    if (body.targetQuoteId === id) {
      return NextResponse.json(
        { error: "В эту же смету лист копируется пунктом «Копировать лист»" },
        { status: 400 },
      );
    }

    const [source, target] = await Promise.all([
      getAccessibleQuote(id, session.user.id, session.user.role),
      getAccessibleQuote(body.targetQuoteId, session.user.id, session.user.role),
    ]);
    if (!source || !target) {
      return NextResponse.json({ error: "Смета не найдена" }, { status: 404 });
    }

    const pricing = parseZonePricing(body.pricing) as Prisma.InputJsonValue;
    const last = await prisma.quoteZone.aggregate({
      where: { quoteId: target.id },
      _max: { sortOrder: true },
    });
    const sortOrder = (last._max.sortOrder ?? -1) + 1;

    const zone = await prisma.$transaction(async (tx) => {
      const created = await tx.quoteZone.create({
        data: {
          quoteId: target.id,
          name: body.name,
          sortOrder,
          active: body.active !== false,
          pricing,
        },
        select: { id: true },
      });
      if (body.blocks.length > 0) {
        await tx.quoteBlock.createMany({
          data: body.blocks.map((b, index) => ({
            quoteId: target.id,
            zoneId: created.id,
            type: b.type,
            sortOrder: b.sortOrder ?? index,
            title: b.title ?? null,
            name: b.name ?? null,
            qty: b.qty ?? 0,
            unitPrice: b.unitPrice ?? 0,
            cashlessOverride: b.cashlessOverride ?? null,
            dayMode: toPrismaDayMode(b.dayMode ?? "HALF_EXTRA"),
            dayCoefOverride: b.dayCoefOverride ?? null,
            catalogItemId: b.catalogItemId ?? null,
            kitId: b.kitId ?? null,
          })),
        });
      }
      return created;
    });

    return NextResponse.json({
      zoneId: zone.id,
      quoteId: target.id,
      proposalNumber: target.proposalNumber,
      eventName: target.eventName,
      date: target.date,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные листа" }, { status: 400 });
    }
    console.error("POST /api/quotes/[id]/zones/copy", e);
    return NextResponse.json(
      { error: "Не удалось скопировать лист" },
      { status: 500 },
    );
  }
}
