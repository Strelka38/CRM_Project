import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessQuote } from "@/lib/quote-access";
import {
  buildSpecLines,
  pruneStaleOverrideKeys,
} from "@/lib/spec-build";
import { requireManager, requireSession } from "@/lib/session";

const overrideSchema = z.object({
  deriveKey: z.string().min(1),
  action: z.enum(["HIDE", "SET_QTY", "RENAME"]),
  qty: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
});

const extraSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["SECTION", "ITEM"]),
  sortOrder: z.number().int(),
  title: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  qty: z.number().optional(),
  catalogItemId: z.string().nullable().optional(),
});

const patchSchema = z.object({
  overrides: z.array(overrideSchema),
  extras: z.array(extraSchema),
});

async function loadSpecPayload(id: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: {
      id: true,
      proposalNumber: true,
      eventName: true,
      date: true,
      place: true,
      client: true,
      lifecycle: true,
      blocks: { orderBy: { sortOrder: "asc" as const } },
    },
  });
  if (!quote) return null;

  // Separate queries — avoids stale Prisma client missing Quote relations
  const [specOverrides, specExtras] = await Promise.all([
    prisma.specOverride.findMany({ where: { quoteId: id } }),
    prisma.specExtraBlock.findMany({
      where: { quoteId: id },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const lines = await buildSpecLines(
    quote.blocks,
    specOverrides,
    specExtras,
  );

  const staleIds = pruneStaleOverrideKeys(lines, specOverrides);
  if (staleIds.length > 0) {
    await prisma.specOverride.deleteMany({
      where: { id: { in: staleIds } },
    });
  }

  const overrides = specOverrides.filter((o) => !staleIds.includes(o.id));

  return {
    quote,
    lines,
    overrides,
    extras: specExtras,
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

    const payload = await loadSpecPayload(id);
    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const canEdit = session.user.role === "MANAGER";
    const visible = payload.lines.filter((l) => !l.hidden);

    return NextResponse.json({
      quoteId: payload.quote.id,
      proposalNumber: payload.quote.proposalNumber,
      eventName: payload.quote.eventName,
      date: payload.quote.date,
      place: payload.quote.place,
      client: payload.quote.client,
      lifecycle: payload.quote.lifecycle,
      canEdit,
      lines: canEdit ? payload.lines : visible,
      overrides: payload.overrides,
      extras: payload.extras,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/quotes/[id]/spec", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Не удалось собрать спецификацию",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const body = patchSchema.parse(await req.json());

    await prisma.$transaction(async (tx) => {
      await tx.specOverride.deleteMany({ where: { quoteId: id } });
      if (body.overrides.length > 0) {
        await tx.specOverride.createMany({
          data: body.overrides.map((o) => ({
            quoteId: id,
            deriveKey: o.deriveKey,
            action: o.action,
            qty: o.action === "SET_QTY" ? (o.qty ?? 0) : null,
            name: o.action === "RENAME" ? (o.name ?? "") : null,
          })),
        });
      }

      await tx.specExtraBlock.deleteMany({ where: { quoteId: id } });
      if (body.extras.length > 0) {
        await tx.specExtraBlock.createMany({
          data: body.extras.map((e, index) => ({
            quoteId: id,
            type: e.type,
            sortOrder: e.sortOrder ?? index,
            title: e.title ?? null,
            name: e.name ?? null,
            qty: e.qty ?? 0,
            catalogItemId: e.catalogItemId ?? null,
          })),
        });
      }
    });

    const payload = await loadSpecPayload(id);
    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      quoteId: payload.quote.id,
      proposalNumber: payload.quote.proposalNumber,
      eventName: payload.quote.eventName,
      date: payload.quote.date,
      place: payload.quote.place,
      client: payload.quote.client,
      lifecycle: payload.quote.lifecycle,
      canEdit: true,
      lines: payload.lines,
      overrides: payload.overrides,
      extras: payload.extras,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/quotes/[id]/spec", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Не удалось сохранить спецификацию",
      },
      { status: 500 },
    );
  }
}
