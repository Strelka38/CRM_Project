import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { ensureDefaultZone, getAccessibleQuote } from "@/lib/quote-access";
import { blocksInActiveZones, toPrismaDayMode } from "@/lib/quote-calc";
import {
  changedQuoteMetaKeys,
  summarizeQuotePatch,
} from "@/lib/quote-history";
import { requireManager, requireSession } from "@/lib/session";
import { validateQuoteStock } from "@/lib/stock";
import { syncQuoteAssignmentSlots } from "@/lib/quote-assignment-slots";
import {
  clearInvoiceDueNotifications,
  notifyBrigadiersOfConfirmedMount,
} from "@/lib/notifications";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await ensureDefaultZone(id);
    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(quote);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const zoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  active: z.boolean().optional(),
});

const blockSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["SECTION", "ITEM", "NOTE", "KIT_HEADER"]),
  sortOrder: z.number().int(),
  title: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  qty: z.number().optional(),
  unitPrice: z.number().optional(),
  cashlessOverride: z.number().nullable().optional(),
  dayMode: z.string().optional(),
  dayCoefOverride: z.number().nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
  kitId: z.string().nullable().optional(),
  zoneId: z.string().min(1),
});

const patchSchema = z.object({
  proposalNumber: z.string().optional(),
  eventName: z.string().optional(),
  date: z.string().optional(),
  mountDate: z.string().optional(),
  mountDurationDays: z.number().int().positive().optional(),
  demountDate: z.string().optional(),
  demountDurationDays: z.number().int().positive().optional(),
  time: z.string().optional(),
  place: z.string().optional(),
  venueId: z.string().nullable().optional(),
  client: z.string().optional(),
  clientId: z.string().nullable().optional(),
  managerName: z.string().optional(),
  ownerId: z.string().min(1).optional(),
  cashless: z.boolean().optional(),
  cashlessPercent: z.number().min(0).max(99).optional(),
  durationDays: z.number().int().positive().optional(),
  notes: z.array(z.string()).optional(),
  brief: z.string().max(8000).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  lifecycle: z
    .enum(["CALCULATED", "CONFIRMED", "CANCELLED", "COMPLETED"])
    .optional(),
  invoiceRequired: z.boolean().optional(),
  invoiceSent: z.boolean().optional(),
  paid: z.boolean().optional(),
  paymentComment: z.string().optional(),
  forceStock: z.boolean().optional(),
  zones: z.array(zoneSchema).optional(),
  blocks: z.array(blockSchema).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    await ensureSchemaOnce();
    const { id } = await params;
    const existing = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = patchSchema.parse(await req.json());
    const { blocks, zones, forceStock: _forceStock, ...meta } = body;

    if (meta.clientId) {
      const clientExists = await prisma.client.findUnique({
        where: { id: meta.clientId },
        select: { id: true, companyName: true },
      });
      if (!clientExists) {
        return NextResponse.json(
          { error: "Клиент не найден" },
          { status: 400 },
        );
      }
      if (meta.client === undefined || meta.client.trim() === "") {
        meta.client = clientExists.companyName;
      }
    }

    if (meta.venueId) {
      const venueExists = await prisma.venue.findUnique({
        where: { id: meta.venueId },
        select: { id: true, name: true },
      });
      if (!venueExists) {
        return NextResponse.json(
          { error: "Площадка не найдена" },
          { status: 400 },
        );
      }
      if (meta.place === undefined || meta.place.trim() === "") {
        meta.place = venueExists.name;
      }
    } else if (meta.venueId === null) {
      meta.place = "";
    }

    const nextDate = meta.date !== undefined ? meta.date : existing.date;
    const nextDays =
      meta.durationDays !== undefined ? meta.durationDays : existing.durationDays;
    const nextLifecycle =
      meta.lifecycle !== undefined ? meta.lifecycle : existing.lifecycle;
    const nextVenueId =
      meta.venueId !== undefined ? meta.venueId : existing.venueId;

    if (
      (nextLifecycle === "CONFIRMED" || nextLifecycle === "COMPLETED") &&
      !nextVenueId
    ) {
      return NextResponse.json(
        { error: "Выберите площадку из справочника" },
        { status: 400 },
      );
    }

    if (meta.ownerId) {
      const manager = await prisma.user.findFirst({
        where: { id: meta.ownerId, role: { in: ["ADMIN", "MANAGER"] }, active: true },
        select: { id: true, name: true },
      });
      if (!manager) {
        return NextResponse.json(
          { error: "Менеджер не найден" },
          { status: 400 },
        );
      }
      if (meta.managerName === undefined || meta.managerName.trim() === "") {
        meta.managerName = manager.name;
      }
    }

    if (zones && zones.length === 0) {
      return NextResponse.json(
        { error: "Нужна хотя бы одна зона" },
        { status: 400 },
      );
    }

    if (zones && blocks) {
      const zoneIds = new Set(zones.map((z) => z.id));
      for (const b of blocks) {
        if (!zoneIds.has(b.zoneId)) {
          return NextResponse.json(
            { error: "Блок ссылается на неизвестную зону" },
            { status: 400 },
          );
        }
      }
    }

    if (zones && !blocks) {
      const nextIds = new Set(zones.map((z) => z.id));
      for (const ez of existing.zones) {
        if (!nextIds.has(ez.id)) {
          const count = existing.blocks.filter((b) => b.zoneId === ez.id).length;
          if (count > 0) {
            return NextResponse.json(
              { error: `Нельзя удалить непустую зону «${ez.name}»` },
              { status: 400 },
            );
          }
        }
      }
    }

    const eventDate = parseEventDate(nextDate);
    const stockSchedule = {
      date: nextDate,
      eventDate,
      durationDays: nextDays,
      mountDate:
        meta.mountDate !== undefined ? meta.mountDate : existing.mountDate,
      mountDurationDays:
        meta.mountDurationDays !== undefined
          ? meta.mountDurationDays
          : existing.mountDurationDays,
      demountDate:
        meta.demountDate !== undefined
          ? meta.demountDate
          : existing.demountDate,
      demountDurationDays:
        meta.demountDurationDays !== undefined
          ? meta.demountDurationDays
          : existing.demountDurationDays,
    };

    const zoneList = zones ?? existing.zones;
    const blocksForCheck = blocksInActiveZones(
      zoneList,
      (blocks ?? existing.blocks) as Array<{
        type: string;
        zoneId?: string | null;
        catalogItemId?: string | null;
        kitId?: string | null;
        qty?: number | null;
        name?: string | null;
      }>,
    );
    let stockIssues: Awaited<ReturnType<typeof validateQuoteStock>> = [];
    if (
      (nextLifecycle === "CONFIRMED" || existing.lifecycle === "CONFIRMED") &&
      nextLifecycle !== "CANCELLED"
    ) {
      stockIssues = await validateQuoteStock(id, blocksForCheck, stockSchedule);
    }

    await prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: {
          ...meta,
          ...(meta.date !== undefined ? { eventDate } : {}),
        },
      });

      if (zones || blocks) {
        // Replace blocks first so zone FK can be dropped safely
        await tx.quoteBlock.deleteMany({ where: { quoteId: id } });
      }

      if (zones) {
        const keepIds = zones.map((z) => z.id);
        await tx.quoteZone.deleteMany({
          where: { quoteId: id, id: { notIn: keepIds } },
        });

        for (const z of zones) {
          await tx.quoteZone.upsert({
            where: { id: z.id },
            create: {
              id: z.id,
              quoteId: id,
              name: z.name,
              sortOrder: z.sortOrder,
              active: z.active ?? true,
            },
            update: {
              name: z.name,
              sortOrder: z.sortOrder,
              ...(z.active !== undefined ? { active: z.active } : {}),
            },
          });
        }
      }

      if (blocks && blocks.length > 0) {
        await tx.quoteBlock.createMany({
          data: blocks.map((b, index) => ({
            quoteId: id,
            zoneId: b.zoneId,
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

      const saved = await tx.quote.findUnique({
        where: { id },
        include: {
          zones: { orderBy: { sortOrder: "asc" } },
          blocks: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (saved) {
        const audit = summarizeQuotePatch({
          prevLifecycle: existing.lifecycle,
          nextLifecycle,
          changedMetaKeys: changedQuoteMetaKeys(
            existing as unknown as Record<string, unknown>,
            meta as unknown as Record<string, unknown>,
          ),
          zonesChanged: Boolean(zones),
          zoneCount: zones ? zones.length : null,
          blocksChanged: Boolean(blocks),
          blockCount: blocks ? blocks.length : null,
        });
        await tx.quoteAuditEvent.create({
          data: {
            quoteId: id,
            actorId: session.user.id,
            action: audit.action,
            summary: audit.summary,
            diff: audit.diff,
          },
        });
      }

      if (meta.invoiceSent === false && meta.paid !== true) {
        await tx.quoteAttachment.updateMany({
          where: { quoteId: id },
          data: { invoiceSent: false },
        });
      }

      await syncQuoteAssignmentSlots(tx, id);
    });

    if (meta.paid === true || meta.invoiceSent === true) {
      await clearInvoiceDueNotifications(id);
    }

    if (
      existing.lifecycle !== "CONFIRMED" &&
      nextLifecycle === "CONFIRMED"
    ) {
      const q = await prisma.quote.findUnique({
        where: { id },
        select: {
          id: true,
          eventName: true,
          proposalNumber: true,
          date: true,
        },
      });
      if (q) {
        await notifyBrigadiersOfConfirmedMount(q);
      }
    }

    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    return NextResponse.json({
      ...quote,
      stockIssues,
      stockWarning: stockIssues.length > 0,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const existing = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.quote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
