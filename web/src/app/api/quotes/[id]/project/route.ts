import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { canAccessQuote } from "@/lib/quote-access";
import { recommendedMountQty } from "@/lib/quote-assignment-slots";
import {
  canEditBrief,
  canEditQuoteSchedule,
  canManageAssignments,
  canManageEventAttachments,
  isManager,
  requireBriefEditor,
  requireSession,
} from "@/lib/session";

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      console.error("ensureSchemaOnce", e);
      throw e;
    });
  }
  return ensureOnce;
}

type ProjectPayload = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  eventDate: Date | null;
  mountDate: string;
  mountDurationDays: number;
  demountDate: string;
  demountDurationDays: number;
  time: string;
  place: string;
  client: string;
  managerName: string;
  brief: string;
  lifecycle: string;
  durationDays: number;
  owner: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
  } | null;
  assignments: Array<{
    id: string;
    userId?: string | null;
    isFreelancer?: boolean;
    freelancerName?: string;
    kind?: string;
    dayIndex?: number | null;
    user: {
      id: string;
      name: string;
      firstName: string;
      lastName: string;
    } | null;
    specialty: { id: string; name: string };
  }>;
  recommendedMountSlots?: number;
  _count: { comments: number; attachments: number };
};

async function loadProjectQuote(id: string): Promise<ProjectPayload | null> {
  // Always try to heal schema first (idempotent, fast if already OK)
  try {
    await ensureSchemaOnce();
  } catch {
    // continue — we'll load what we can
  }

  // Core quote via raw SQL — only columns that exist since init + optional mounts
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      proposalNumber: string;
      eventName: string;
      date: string;
      eventDate: Date | null;
      time: string;
      place: string;
      client: string;
      managerName: string;
      brief: string;
      lifecycle: string;
      durationDays: number;
      ownerId: string;
      mountDate: string | null;
      mountDurationDays: number | null;
      demountDate: string | null;
      demountDurationDays: number | null;
    }>
  >`
    SELECT
      q.id,
      q."proposalNumber",
      q."eventName",
      q.date,
      q."eventDate",
      q.time,
      q.place,
      q.client,
      q."managerName",
      q.brief,
      q.lifecycle::text AS lifecycle,
      q."durationDays",
      q."ownerId",
      COALESCE(q."mountDate", '') AS "mountDate",
      COALESCE(q."mountDurationDays", 1) AS "mountDurationDays",
      COALESCE(q."demountDate", '') AS "demountDate",
      COALESCE(q."demountDurationDays", 1) AS "demountDurationDays"
    FROM "Quote" q
    WHERE q.id = ${id}
    LIMIT 1
  `.catch(async () => {
    // Mount columns missing — select without them
    return prisma.$queryRaw<
      Array<{
        id: string;
        proposalNumber: string;
        eventName: string;
        date: string;
        eventDate: Date | null;
        time: string;
        place: string;
        client: string;
        managerName: string;
        brief: string;
        lifecycle: string;
        durationDays: number;
        ownerId: string;
        mountDate: null;
        mountDurationDays: null;
        demountDate: null;
        demountDurationDays: null;
      }>
    >`
      SELECT
        q.id,
        q."proposalNumber",
        q."eventName",
        q.date,
        q."eventDate",
        q.time,
        q.place,
        q.client,
        q."managerName",
        q.brief,
        q.lifecycle::text AS lifecycle,
        q."durationDays",
        q."ownerId",
        NULL::text AS "mountDate",
        NULL::int AS "mountDurationDays",
        NULL::text AS "demountDate",
        NULL::int AS "demountDurationDays"
      FROM "Quote" q
      WHERE q.id = ${id}
      LIMIT 1
    `;
  });

  const row = rows[0];
  if (!row) return null;

  const owner = await prisma.user.findUnique({
    where: { id: row.ownerId },
    select: { id: true, name: true, firstName: true, lastName: true },
  });

  // Assignments: raw join avoids Prisma selecting missing freelancer columns
  let assignments: ProjectPayload["assignments"] = [];
  try {
    const arows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string | null;
        isFreelancer: boolean;
        freelancerName: string;
        kind: string;
        dayIndex: number | null;
        userName: string | null;
        userFirst: string | null;
        userLast: string | null;
        specialtyId: string;
        specialtyName: string;
      }>
    >`
      SELECT
        a.id,
        a."userId",
        COALESCE(a."isFreelancer", false) AS "isFreelancer",
        COALESCE(a."freelancerName", '') AS "freelancerName",
        COALESCE(a.kind::text, 'EVENT') AS kind,
        a."dayIndex" AS "dayIndex",
        u.name AS "userName",
        u."firstName" AS "userFirst",
        u."lastName" AS "userLast",
        s.id AS "specialtyId",
        s.name AS "specialtyName"
      FROM "QuoteAssignment" a
      LEFT JOIN "User" u ON u.id = a."userId"
      INNER JOIN "Specialty" s ON s.id = a."specialtyId"
      WHERE a."quoteId" = ${id}
      ORDER BY a."createdAt" ASC
    `.catch(async () => {
      // Freelancer columns missing
      return prisma.$queryRaw<
        Array<{
          id: string;
          userId: string | null;
          isFreelancer: boolean;
          freelancerName: string;
          kind: string;
          dayIndex: number | null;
          userName: string | null;
          userFirst: string | null;
          userLast: string | null;
          specialtyId: string;
          specialtyName: string;
        }>
      >`
        SELECT
          a.id,
          a."userId",
          false AS "isFreelancer",
          '' AS "freelancerName",
          'EVENT' AS kind,
          NULL::integer AS "dayIndex",
          u.name AS "userName",
          u."firstName" AS "userFirst",
          u."lastName" AS "userLast",
          s.id AS "specialtyId",
          s.name AS "specialtyName"
        FROM "QuoteAssignment" a
        LEFT JOIN "User" u ON u.id = a."userId"
        INNER JOIN "Specialty" s ON s.id = a."specialtyId"
        WHERE a."quoteId" = ${id}
        ORDER BY a."createdAt" ASC
      `;
    });
    assignments = arows.map((a) => ({
      id: a.id,
      userId: a.userId,
      isFreelancer: a.isFreelancer,
      freelancerName: a.freelancerName,
      kind: a.kind || "EVENT",
      dayIndex: a.dayIndex ?? null,
      user: a.userId
        ? {
            id: a.userId,
            name: a.userName || "",
            firstName: a.userFirst || "",
            lastName: a.userLast || "",
          }
        : null,
      specialty: { id: a.specialtyId, name: a.specialtyName },
    }));
  } catch (e) {
    console.error("project assignments raw query failed", e);
    assignments = [];
  }

  let comments = 0;
  let attachments = 0;
  try {
    const counts = await prisma.$queryRaw<
      Array<{ comments: bigint; attachments: bigint }>
    >`
      SELECT
        (SELECT COUNT(*)::bigint FROM "QuoteComment" c WHERE c."quoteId" = ${id}) AS comments,
        (SELECT COUNT(*)::bigint FROM "QuoteAttachment" a WHERE a."quoteId" = ${id}) AS attachments
    `;
    comments = Number(counts[0]?.comments ?? 0);
    attachments = Number(counts[0]?.attachments ?? 0);
  } catch {
    // ignore
  }

  let recommendedMountSlots = assignments.filter(
    (a) => (a.kind || "EVENT") === "MOUNT",
  ).length;
  try {
    const quote = await prisma.quote.findUnique({
      where: { id },
      select: {
        zones: { select: { id: true, active: true } },
        blocks: {
          select: {
            type: true,
            name: true,
            title: true,
            qty: true,
            zoneId: true,
            catalogItem: { select: { name: true, itemKind: true } },
          },
        },
      },
    });
    if (quote) {
      const activeIds = new Set(
        quote.zones.filter((z) => z.active !== false).map((z) => z.id),
      );
      recommendedMountSlots = recommendedMountQty(
        quote.blocks
          .filter((b) => !b.zoneId || activeIds.has(b.zoneId))
          .map((b) => ({
            type: b.type,
            name: b.name,
            title: b.title,
            qty: b.qty,
            itemKind: b.catalogItem?.itemKind ?? null,
            catalogName: b.catalogItem?.name ?? null,
          })),
      );
    }
  } catch {
    // kind/catalog columns may be missing on old DBs
  }

  return {
    id: row.id,
    proposalNumber: row.proposalNumber,
    eventName: row.eventName,
    date: row.date,
    eventDate: row.eventDate,
    mountDate: row.mountDate || "",
    mountDurationDays: row.mountDurationDays ?? 1,
    demountDate: row.demountDate || "",
    demountDurationDays: row.demountDurationDays ?? 1,
    time: row.time,
    place: row.place,
    client: row.client,
    managerName: row.managerName,
    brief: row.brief,
    lifecycle: row.lifecycle,
    durationDays: row.durationDays,
    owner,
    assignments,
    recommendedMountSlots,
    _count: { comments, attachments },
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

    const quote = await loadProjectQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...quote,
      isManager: isManager(session.user.role),
      canManageAssignments: canManageAssignments(session.user.role),
      canEditBrief: canEditBrief(session.user.role),
      canEditSchedule: canEditQuoteSchedule(session.user.role),
      canManageAttachments: canManageEventAttachments(session.user.role),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/quotes/[id]/project", e);
    const detail = e instanceof Error ? e.message.slice(0, 400) : String(e);
    return NextResponse.json(
      { error: "Не удалось загрузить мероприятие", detail },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({
  brief: z.string().max(8000).optional(),
  date: z.string().optional(),
  durationDays: z.number().int().positive().optional(),
  time: z.string().optional(),
  mountDate: z.string().optional(),
  mountDurationDays: z.number().int().positive().optional(),
  demountDate: z.string().optional(),
  demountDurationDays: z.number().int().positive().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireBriefEditor();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = patchSchema.parse(await req.json());
    const quote = await prisma.quote.update({
      where: { id },
      data: {
        ...(body.brief !== undefined ? { brief: body.brief } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.durationDays !== undefined
          ? { durationDays: body.durationDays }
          : {}),
        ...(body.time !== undefined ? { time: body.time } : {}),
        ...(body.mountDate !== undefined ? { mountDate: body.mountDate } : {}),
        ...(body.mountDurationDays !== undefined
          ? { mountDurationDays: body.mountDurationDays }
          : {}),
        ...(body.demountDate !== undefined
          ? { demountDate: body.demountDate }
          : {}),
        ...(body.demountDurationDays !== undefined
          ? { demountDurationDays: body.demountDurationDays }
          : {}),
      },
      select: {
        id: true,
        brief: true,
        date: true,
        durationDays: true,
        time: true,
        mountDate: true,
        mountDurationDays: true,
        demountDate: true,
        demountDurationDays: true,
      },
    });
    return NextResponse.json(quote);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/quotes/[id]/project", e);
    return NextResponse.json(
      { error: "Не удалось сохранить" },
      { status: 500 },
    );
  }
}
