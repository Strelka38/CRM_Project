import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { getAccessibleQuote } from "@/lib/quote-access";
import { toPrismaDayMode } from "@/lib/quote-calc";
import {
  isQuoteSnapshotPayload,
  snapshotToQuotePatch,
} from "@/lib/quote-history";
import { linesFromRevision, writeSpecRevision } from "@/lib/spec-revision";
import { requireSpecEditor } from "@/lib/session";

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

const LIFE = ["CALCULATED", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;

const bodySchema = z.object({
  snapshotId: z.string().min(1),
  kind: z.enum(["quote", "spec"]).default("quote"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSpecEditor();
    const { id } = await params;
    await ensureSchemaOnce();
    const existing = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { snapshotId, kind } = bodySchema.parse(await req.json());

    if (kind === "spec") {
      const snap = await prisma.specRevision.findFirst({
        where: { id: snapshotId, quoteId: id },
      });
      if (!snap) {
        return NextResponse.json(
          { error: "Снимок не найден или повреждён" },
          { status: 404 },
        );
      }
      const lines = linesFromRevision(snap.lines);
      if (lines.length === 0) {
        return NextResponse.json(
          { error: "В снимке спецификации нет строк" },
          { status: 400 },
        );
      }
      await writeSpecRevision(
        id,
        lines,
        session.user.id,
        snap.title.trim() ? `restore:${snap.title.trim()}` : "restore",
        "",
      );
      await prisma.quote.update({
        where: { id },
        data: { specLineOrder: lines.map((l) => l.key) },
      });
      return NextResponse.json({ ok: true, kind: "spec" });
    }
    const snap = await prisma.quoteSnapshot.findFirst({
      where: { id: snapshotId, quoteId: id },
    });
    if (!snap || !isQuoteSnapshotPayload(snap.payload)) {
      return NextResponse.json(
        { error: "Снимок не найден или повреждён" },
        { status: 404 },
      );
    }

    const patch = snapshotToQuotePatch(snap.payload);
    if (patch.zones.length === 0) {
      return NextResponse.json(
        { error: "В снимке нет зон" },
        { status: 400 },
      );
    }

    const lifecycle = LIFE.includes(patch.lifecycle as (typeof LIFE)[number])
      ? (patch.lifecycle as (typeof LIFE)[number])
      : existing.lifecycle;
    const eventDate = parseEventDate(patch.date);

    await prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: {
          proposalNumber: patch.proposalNumber,
          eventName: patch.eventName,
          date: patch.date,
          eventDate,
          mountDate: patch.mountDate,
          mountDurationDays: patch.mountDurationDays,
          demountDate: patch.demountDate,
          demountDurationDays: patch.demountDurationDays,
          time: patch.time,
          place: patch.place,
          venueId: patch.venueId,
          client: patch.client,
          clientId: patch.clientId,
          requestContact: patch.requestContact,
          managerName: patch.managerName,
          cashless: patch.cashless,
          cashlessPercent: patch.cashlessPercent,
          durationDays: patch.durationDays,
          notes: patch.notes,
          brief: patch.brief,
          discountPercent: patch.discountPercent,
          lifecycle,
        },
      });

      await tx.quoteBlock.deleteMany({ where: { quoteId: id } });

      const keepIds = patch.zones.map((z) => z.id);
      await tx.quoteZone.deleteMany({
        where: { quoteId: id, id: { notIn: keepIds } },
      });
      for (const z of patch.zones) {
        await tx.quoteZone.upsert({
          where: { id: z.id },
          create: {
            id: z.id,
            quoteId: id,
            name: z.name,
            sortOrder: z.sortOrder,
            active: z.active,
          },
          update: {
            name: z.name,
            sortOrder: z.sortOrder,
            active: z.active,
          },
        });
      }

      if (patch.blocks.length > 0) {
        await tx.quoteBlock.createMany({
          data: patch.blocks.map((b, index) => ({
            quoteId: id,
            zoneId: b.zoneId,
            type: b.type,
            sortOrder: b.sortOrder ?? index,
            title: b.title,
            name: b.name,
            qty: b.qty,
            unitPrice: b.unitPrice,
            cashlessOverride: b.cashlessOverride,
            dayMode: toPrismaDayMode(b.dayMode),
            dayCoefOverride: b.dayCoefOverride,
            catalogItemId: b.catalogItemId,
            kitId: b.kitId,
          })),
        });
      }

      await tx.quoteAuditEvent.create({
        data: {
          quoteId: id,
          actorId: session.user.id,
          action: "RESTORE",
          summary: snap.title.trim()
            ? `откат к «${snap.title.trim()}»`
            : `откат к снимку ${snap.createdAt.toLocaleString("ru-RU")}`,
          diff: { snapshotId: snap.id, title: snap.title },
        },
      });
    });

    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    return NextResponse.json(quote);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
