import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessQuote } from "@/lib/quote-access";
import {
  applySpecLineOrder,
  buildSpecLines,
  pruneStaleOverrideKeys,
  sanitizeSpecLineOrder,
} from "@/lib/spec-build";
import {
  canEditSpec,
  requireSession,
  requireSpecEditor,
} from "@/lib/session";

const overrideSchema = z.object({
  deriveKey: z.string().min(1),
  action: z.enum(["HIDE", "SET_QTY", "RENAME", "SET_COMMENT", "REPLACE"]),
  qty: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
});

const extraSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["SECTION", "ITEM"]),
  sortOrder: z.number().int(),
  title: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  qty: z.number().optional(),
  comment: z.string().optional(),
  catalogItemId: z.string().nullable().optional(),
});

const patchSchema = z.object({
  overrides: z.array(overrideSchema),
  extras: z.array(extraSchema),
  lineOrder: z.array(z.string()).optional(),
});

async function loadAssignments(quoteId: string) {
  const rows = await prisma.quoteAssignment.findMany({
    where: { quoteId },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      userId: true,
      isFreelancer: true,
      freelancerName: true,
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      },
      specialty: { select: { id: true, name: true } },
    },
  });
  return rows.map((a) => {
    const isFreelancer = a.isFreelancer || !a.userId;
    const fullName = isFreelancer
      ? (a.freelancerName || "").trim() || "Фрилансер"
      : [a.user?.lastName, a.user?.firstName].filter(Boolean).join(" ").trim() ||
        a.user?.name ||
        "Сотрудник";
    return {
      id: a.id,
      userId: a.userId,
      isFreelancer,
      name: fullName,
      specialtyId: a.specialty.id,
      specialtyName: a.specialty.name,
    };
  });
}

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
      durationDays: true,
      specLineOrder: true,
      blocks: { orderBy: { sortOrder: "asc" as const } },
    },
  });
  if (!quote) return null;

  const [specOverrides, specExtras, assignments] = await Promise.all([
    prisma.specOverride.findMany({ where: { quoteId: id } }),
    prisma.specExtraBlock.findMany({
      where: { quoteId: id },
      orderBy: { sortOrder: "asc" },
    }),
    loadAssignments(id),
  ]);

  const built = await buildSpecLines(
    quote.blocks,
    specOverrides,
    specExtras,
  );

  const staleIds = pruneStaleOverrideKeys(built, specOverrides);
  if (staleIds.length > 0) {
    await prisma.specOverride.deleteMany({
      where: { id: { in: staleIds } },
    });
  }

  const overrides = specOverrides.filter((o) => !staleIds.includes(o.id));
  const lineOrder = sanitizeSpecLineOrder(built, quote.specLineOrder);
  const lines = applySpecLineOrder(built, lineOrder);

  if (
    lineOrder.length !== quote.specLineOrder.length ||
    lineOrder.some((k, i) => k !== quote.specLineOrder[i])
  ) {
    await prisma.quote.update({
      where: { id },
      data: { specLineOrder: lineOrder },
    });
  }

  return {
    quote,
    lines,
    lineOrder,
    overrides,
    extras: specExtras,
    assignments,
  };
}

function serializePayload(
  payload: NonNullable<Awaited<ReturnType<typeof loadSpecPayload>>>,
  canEdit: boolean,
) {
  const visible = payload.lines.filter((l) => !l.hidden);
  return {
    quoteId: payload.quote.id,
    proposalNumber: payload.quote.proposalNumber,
    eventName: payload.quote.eventName,
    date: payload.quote.date,
    place: payload.quote.place,
    client: payload.quote.client,
    lifecycle: payload.quote.lifecycle,
    durationDays: payload.quote.durationDays,
    canEdit,
    lines: canEdit ? payload.lines : visible,
    lineOrder: payload.lineOrder,
    overrides: payload.overrides,
    extras: payload.extras,
    assignments: payload.assignments,
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

    return NextResponse.json(
      serializePayload(payload, canEditSpec(session.user.role)),
    );
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
    const session = await requireSpecEditor();
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
            name:
              o.action === "RENAME" ||
              o.action === "SET_COMMENT" ||
              o.action === "REPLACE"
                ? (o.name ?? "")
                : null,
            catalogItemId:
              o.action === "REPLACE" ? (o.catalogItemId ?? null) : null,
          })),
        });
      }

      await tx.specExtraBlock.deleteMany({ where: { quoteId: id } });
      if (body.extras.length > 0) {
        await tx.specExtraBlock.createMany({
          data: body.extras.map((e, index) => ({
            id: e.id,
            quoteId: id,
            type: e.type,
            sortOrder: e.sortOrder ?? index,
            title: e.title ?? null,
            name: e.name ?? null,
            qty: e.qty ?? 0,
            comment: e.comment ?? "",
            catalogItemId: e.catalogItemId ?? null,
          })),
        });
      }

      if (body.lineOrder) {
        await tx.quote.update({
          where: { id },
          data: { specLineOrder: body.lineOrder },
        });
      }
    });

    const payload = await loadSpecPayload(id);
    if (!payload) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(serializePayload(payload, true));
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
