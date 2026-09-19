import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ownerShortsWithFallback,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { canAccessQuote } from "@/lib/quote-access";
import {
  applyOwnerLabels,
  applySpecLineOrder,
  applySpecOverrides,
  buildSpecLines,
  extrasToSpecLines,
  pruneStaleOverrideKeys,
  sanitizeSpecLineOrder,
  type SpecLine,
} from "@/lib/spec-build";
import {
  latestSpecRevision,
  linesFromRevision,
  writeSpecRevision,
} from "@/lib/spec-revision";
import { specLinesFromRevisionOrDerived } from "@/lib/spec-merge";
import {
  canEditSpec,
  requireSession,
  requireSpecEditor,
} from "@/lib/session";

const overrideSchema = z.object({
  deriveKey: z.string().min(1),
  action: z.enum(["HIDE", "SET_QTY", "RENAME", "SET_COMMENT", "REPLACE", "DELETE"]),
  qty: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  catalogItemId: z.string().nullable().optional(),
});

const extraSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["SECTION", "ITEM"]),
  sortOrder: z.number().int(),
  zoneId: z.string().nullable().optional(),
  zoneName: z.string().nullable().optional(),
  zoneSortOrder: z.number().nullable().optional(),
  zoneActive: z.boolean().optional(),
  title: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  qty: z.number().optional(),
  comment: z.string().optional(),
  hidden: z.boolean().optional(),
  catalogItemId: z.string().nullable().optional(),
  ownerLabel: z.string().nullable().optional(),
});

const patchSchema = z.object({
  overrides: z.array(overrideSchema),
  extras: z.array(extraSchema),
  lineOrder: z.array(z.string()).optional(),
  ownerLabels: z
    .array(
      z.object({
        key: z.string().min(1),
        ownerLabel: z.string(),
      }),
    )
    .optional(),
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
      kind: true,
      dayIndex: true,
      zoneId: true,
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      },
      specialty: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
    },
  });
  return rows.map((a) => {
    const vacant = !a.userId && !a.isFreelancer;
    const isFreelancer = Boolean(a.isFreelancer);
    const fullName = vacant
      ? "не назначен"
      : isFreelancer
        ? (a.freelancerName || "").trim() || "Фрилансер"
        : [a.user?.lastName, a.user?.firstName].filter(Boolean).join(" ").trim() ||
          a.user?.name ||
          "Сотрудник";
    return {
      id: a.id,
      userId: a.userId,
      isFreelancer,
      vacant,
      kind: a.kind || "EVENT",
      dayIndex: a.dayIndex ?? null,
      zoneId: a.zoneId ?? null,
      name: fullName,
      specialtyId: a.specialty.id,
      specialtyName: a.specialty.name,
      specialty: a.specialty,
      zone: a.zone,
      user: a.user,
      freelancerName: a.freelancerName,
    };
  });
}

async function enrichOwnerLabels(lines: SpecLine[]): Promise<SpecLine[]> {
  const ids = [
    ...new Set(
      lines
        .map((l) => l.catalogItemId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) {
    return lines.map((l) => ({
      ...l,
      ownerLabel: l.ownerLabel ?? "—",
    }));
  }
  const items = await prisma.catalogItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, owners: true },
  });
  const map = new Map(
    items.map((i) => [i.id, i.owners as CatalogOwnerValue[]]),
  );
  return lines.map((l) => ({
    ...l,
    ownerLabel: l.catalogItemId
      ? ownerShortsWithFallback(l.ownerLabel, map.get(l.catalogItemId))
      : ownerShortsWithFallback(l.ownerLabel, []),
  }));
}

async function loadSpecPayload(id: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: {
      id: true,
      proposalNumber: true,
      eventName: true,
      date: true,
      mountDate: true,
      mountDurationDays: true,
      demountDate: true,
      demountDurationDays: true,
      place: true,
      client: true,
      lifecycle: true,
      durationDays: true,
      specLineOrder: true,
      blocks: { orderBy: { sortOrder: "asc" as const } },
      zones: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          active: true,
          workingDayIndexes: true,
        },
      },
    },
  });
  if (!quote) return null;

  const [specOverrides, specExtras, assignments, revision] = await Promise.all([
    prisma.specOverride.findMany({ where: { quoteId: id } }),
    prisma.specExtraBlock.findMany({
      where: { quoteId: id },
      orderBy: { sortOrder: "asc" },
    }),
    loadAssignments(id),
    latestSpecRevision(id),
  ]);

  let built: SpecLine[];
  let overrides = specOverrides;
  let hasSnapshot = false;
  let snapshotAt: string | null = null;

  if (revision) {
    hasSnapshot = true;
    snapshotAt = revision.createdAt.toISOString();
    built = applySpecOverrides(
      specLinesFromRevisionOrDerived(revision, []).lines,
      specOverrides,
    );
  } else {
    built = await buildSpecLines(
      quote.blocks,
      specOverrides,
      specExtras,
      quote.zones,
    );
    const staleIds = pruneStaleOverrideKeys(built, specOverrides);
    if (staleIds.length > 0) {
      await prisma.specOverride.deleteMany({
        where: { id: { in: staleIds } },
      });
    }
    overrides = specOverrides.filter((o) => !staleIds.includes(o.id));
  }

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
  const enrichedLines = await enrichOwnerLabels(lines);

  return {
    quote,
    lines: enrichedLines,
    lineOrder,
    overrides,
    extras: specExtras.map((extra) => {
      const line = enrichedLines.find((row) => row.extraId === extra.id);
      return {
        ...extra,
        zoneId: line?.zoneId ?? null,
        zoneName: line?.zoneName ?? null,
        zoneSortOrder: line?.zoneSortOrder ?? null,
        zoneActive: line?.zoneActive !== false,
        ownerLabel: line?.ownerLabel ?? null,
      };
    }),
    assignments,
    hasSnapshot,
    snapshotAt,
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
    mountDate: payload.quote.mountDate,
    mountDurationDays: payload.quote.mountDurationDays,
    demountDate: payload.quote.demountDate,
    demountDurationDays: payload.quote.demountDurationDays,
    place: payload.quote.place,
    client: payload.quote.client,
    lifecycle: payload.quote.lifecycle,
    durationDays: payload.quote.durationDays,
    canEdit,
    hasSnapshot: payload.hasSnapshot,
    snapshotAt: payload.snapshotAt,
    lines: canEdit ? payload.lines : visible,
    lineOrder: payload.lineOrder,
    overrides: payload.overrides,
    extras: payload.extras,
    assignments: payload.assignments,
    zones: payload.quote.zones,
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
            hidden: Boolean(e.hidden),
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

    const revision = await latestSpecRevision(id);
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        blocks: { orderBy: { sortOrder: "asc" } },
        zones: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            sortOrder: true,
            active: true,
            workingDayIndexes: true,
          },
        },
      },
    });
    if (quote) {
      let snapshotLines: SpecLine[];
      if (revision) {
        const derived = applySpecOverrides(
          linesFromRevision(revision.lines).filter((l) => l.source === "derived"),
          body.overrides,
        );
        snapshotLines = applyOwnerLabels(
          applySpecLineOrder(
            [...derived, ...extrasToSpecLines(body.extras)],
            body.lineOrder || quote.specLineOrder,
          ),
          body.ownerLabels,
        );
      } else {
        const derived = await buildSpecLines(
          quote.blocks,
          body.overrides.map((o) => ({
            id: "",
            quoteId: id,
            deriveKey: o.deriveKey,
            action: o.action,
            qty: o.qty ?? null,
            name: o.name ?? null,
            catalogItemId: o.catalogItemId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
          [],
          quote.zones,
        );
        snapshotLines = applyOwnerLabels(
          applySpecLineOrder(
            [...derived, ...extrasToSpecLines(body.extras)],
            body.lineOrder || quote.specLineOrder,
          ),
          body.ownerLabels,
        );
      }
      await writeSpecRevision(
        id,
        snapshotLines,
        session.user.id,
        revision ? "edit" : "first-save",
      );
    }

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
