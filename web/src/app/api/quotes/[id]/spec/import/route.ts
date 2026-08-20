import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessQuote } from "@/lib/quote-access";
import {
  applySpecLineOrder,
  buildSpecLines,
  sanitizeSpecLineOrder,
} from "@/lib/spec-build";
import {
  diffSpecImport,
  mergeSpecImport,
  overridesFromMerged,
  summarizeSpecImportDiff,
} from "@/lib/spec-merge";
import {
  latestSpecRevision,
  linesFromRevision,
  writeSpecRevision,
} from "@/lib/spec-revision";
import { requireSpecEditor } from "@/lib/session";

const bodySchema = z.object({
  apply: z.boolean().optional(),
});

async function currentAndIncoming(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      blocks: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quote) return null;

  const [overrides, extras, revision] = await Promise.all([
    prisma.specOverride.findMany({ where: { quoteId } }),
    prisma.specExtraBlock.findMany({
      where: { quoteId },
      orderBy: { sortOrder: "asc" },
    }),
    latestSpecRevision(quoteId),
  ]);

  const incoming = await buildSpecLines(quote.blocks, [], extras);
  const current = revision
    ? linesFromRevision(revision.lines)
    : await buildSpecLines(quote.blocks, overrides, extras);

  return { quote, extras, incoming, current, hasSnapshot: Boolean(revision) };
}

export async function POST(
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

    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const packed = await currentAndIncoming(id);
    if (!packed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const diff = diffSpecImport(packed.current, packed.incoming);
    const summary = summarizeSpecImportDiff(diff);

    if (!body.apply) {
      return NextResponse.json({
        hasSnapshot: packed.hasSnapshot,
        diff: summary,
        counts: {
          added: diff.added.length,
          removed: diff.removed.length,
          kept: diff.kept.length,
          extras: diff.extras.length,
        },
      });
    }

    const merged = mergeSpecImport(packed.current, packed.incoming);
    const lineOrder = sanitizeSpecLineOrder(merged, packed.quote.specLineOrder);
    const ordered = applySpecLineOrder(merged, lineOrder);
    const nextOverrides = overridesFromMerged(packed.incoming, ordered);

    await prisma.$transaction(async (tx) => {
      await tx.specOverride.deleteMany({ where: { quoteId: id } });
      if (nextOverrides.length > 0) {
        await tx.specOverride.createMany({
          data: nextOverrides.map((o) => ({
            quoteId: id,
            deriveKey: o.deriveKey,
            action: o.action,
            qty: o.action === "SET_QTY" ? (o.qty ?? 0) : null,
            name:
              o.action === "RENAME" || o.action === "SET_COMMENT"
                ? (o.name ?? "")
                : null,
          })),
        });
      }
      await tx.quote.update({
        where: { id },
        data: { specLineOrder: lineOrder },
      });
    });

    await writeSpecRevision(id, ordered, session.user.id, "import");

    return NextResponse.json({
      ok: true,
      hasSnapshot: true,
      diff: summary,
      counts: {
        added: diff.added.length,
        removed: diff.removed.length,
        kept: diff.kept.length,
        extras: diff.extras.length,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/quotes/[id]/spec/import", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось импортировать" },
      { status: 500 },
    );
  }
}
