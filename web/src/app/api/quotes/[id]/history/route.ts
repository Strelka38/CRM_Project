import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { getAccessibleQuote } from "@/lib/quote-access";
import {
  buildQuoteSnapshotPayload,
  MAX_QUOTE_SNAPSHOTS,
  snapshotIdsToPrune,
} from "@/lib/quote-history";
import {
  latestSpecRevision,
  linesFromRevision,
  MAX_SPEC_SNAPSHOTS,
  specRevisionItemCount,
  writeSpecRevision,
} from "@/lib/spec-revision";
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

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(["quote", "spec"]).default("quote"),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSpecEditor();
    const { id } = await params;
    await ensureSchemaOnce();
    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [snapshots, specRows] = await Promise.all([
      prisma.quoteSnapshot.findMany({
        where: { quoteId: id },
        orderBy: { createdAt: "desc" },
        take: MAX_QUOTE_SNAPSHOTS,
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.specRevision.findMany({
        where: { quoteId: id, title: { not: "" } },
        orderBy: { createdAt: "desc" },
        take: MAX_SPEC_SNAPSHOTS,
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        createdByName: s.createdBy?.name || "—",
        payload: s.payload,
      })),
      specSnapshots: specRows.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        createdByName: s.createdBy?.name || "—",
        itemCount: specRevisionItemCount(s.lines),
      })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/quotes/[id]/history", e);
    return NextResponse.json(
      { error: "Не удалось загрузить историю" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSpecEditor();
    const { id } = await params;
    await ensureSchemaOnce();
    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { title, kind } = createSchema.parse(await req.json());

    if (kind === "spec") {
      const current = await latestSpecRevision(id);
      if (!current) {
        return NextResponse.json(
          { error: "Сначала сохраните спецификацию" },
          { status: 400 },
        );
      }
      const created = await writeSpecRevision(
        id,
        linesFromRevision(current.lines),
        session.user.id,
        "snapshot",
        title,
      );
      return NextResponse.json({
        id: created.id,
        title: created.title,
        createdAt: created.createdAt,
      });
    }

    const snapshot = await prisma.$transaction(async (tx) => {
      const created = await tx.quoteSnapshot.create({
        data: {
          quoteId: id,
          title,
          createdById: session.user.id,
          payload: buildQuoteSnapshotPayload(quote),
        },
      });
      const keepIds = await tx.quoteSnapshot.findMany({
        where: { quoteId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const dropIds = snapshotIdsToPrune(keepIds.map((s) => s.id));
      if (dropIds.length > 0) {
        await tx.quoteSnapshot.deleteMany({
          where: { id: { in: dropIds } },
        });
      }
      await tx.quoteAuditEvent.create({
        data: {
          quoteId: id,
          actorId: session.user.id,
          action: "SNAPSHOT",
          summary: `снимок «${title}»`,
          diff: { snapshotId: created.id, title },
        },
      });
      return created;
    });

    return NextResponse.json({
      id: snapshot.id,
      title: snapshot.title,
      createdAt: snapshot.createdAt,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
