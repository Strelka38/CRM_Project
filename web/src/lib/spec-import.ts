import { prisma } from "@/lib/db";
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
import { syncQuoteAssignmentSlots } from "@/lib/quote-assignment-slots";

export type SpecImportCounts = {
  added: number;
  removed: number;
  kept: number;
  extras: number;
};

async function currentAndIncoming(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      blocks: { orderBy: { sortOrder: "asc" } },
      zones: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, sortOrder: true, active: true },
      },
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

  const incoming = await buildSpecLines(quote.blocks, [], extras, quote.zones);
  const current = revision
    ? linesFromRevision(revision.lines)
    : await buildSpecLines(quote.blocks, overrides, extras, quote.zones);

  return { quote, extras, incoming, current, hasSnapshot: Boolean(revision) };
}

function countsOf(diff: ReturnType<typeof diffSpecImport>): SpecImportCounts {
  return {
    added: diff.added.length,
    removed: diff.removed.length,
    kept: diff.kept.length,
    extras: diff.extras.length,
  };
}

export async function previewSpecImport(quoteId: string) {
  const packed = await currentAndIncoming(quoteId);
  if (!packed) return null;
  const diff = diffSpecImport(packed.current, packed.incoming);
  return {
    hasSnapshot: packed.hasSnapshot,
    diff: summarizeSpecImportDiff(diff),
    counts: countsOf(diff),
  };
}

export async function applySpecImport(quoteId: string, userId: string) {
  const packed = await currentAndIncoming(quoteId);
  if (!packed) return null;

  const diff = diffSpecImport(packed.current, packed.incoming);
  const merged = mergeSpecImport(packed.current, packed.incoming);
  const lineOrder = sanitizeSpecLineOrder(merged, packed.quote.specLineOrder);
  const ordered = applySpecLineOrder(merged, lineOrder);
  const nextOverrides = overridesFromMerged(packed.incoming, ordered);

  await prisma.$transaction(async (tx) => {
    await tx.specOverride.deleteMany({ where: { quoteId } });
    if (nextOverrides.length > 0) {
      await tx.specOverride.createMany({
        data: nextOverrides.map((o) => ({
          quoteId,
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
      where: { id: quoteId },
      data: { specLineOrder: lineOrder },
    });
    await syncQuoteAssignmentSlots(tx, quoteId);
  });

  await writeSpecRevision(quoteId, ordered, userId, "import");

  return {
    ok: true as const,
    hasSnapshot: true,
    diff: summarizeSpecImportDiff(diff),
    counts: countsOf(diff),
  };
}

/** Импорт из сметы по всем КП — создаёт снимок спеки, если его ещё нет или смета уехала. */
export async function applySpecImportForQuotes(
  quoteIds: string[],
  userId: string,
) {
  const results: Array<{
    quoteId: string;
    ok: boolean;
    counts?: SpecImportCounts;
    error?: string;
  }> = [];
  for (const quoteId of quoteIds) {
    try {
      const applied = await applySpecImport(quoteId, userId);
      if (!applied) {
        results.push({ quoteId, ok: false, error: "not found" });
        continue;
      }
      results.push({ quoteId, ok: true, counts: applied.counts });
    } catch (e) {
      results.push({
        quoteId,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
