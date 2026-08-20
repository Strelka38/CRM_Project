import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SpecLine } from "@/lib/spec-build";
import { parseSpecLines, specLinesToJson } from "@/lib/spec-merge";
import { snapshotIdsToPrune, MAX_SPEC_SNAPSHOTS } from "@/lib/quote-history";

export { MAX_SPEC_SNAPSHOTS };
export const MAX_UNTITLED_SPEC_REVISIONS = 1;

export async function latestSpecRevision(quoteId: string) {
  return prisma.specRevision.findFirst({
    where: { quoteId },
    orderBy: { createdAt: "desc" },
  });
}

export function specRevisionIdsToPrune(
  namedNewestFirst: string[],
  untitledNewestFirst: string[],
  keepNamed = MAX_SPEC_SNAPSHOTS,
  keepUntitled = MAX_UNTITLED_SPEC_REVISIONS,
): string[] {
  return [
    ...snapshotIdsToPrune(namedNewestFirst, keepNamed),
    ...snapshotIdsToPrune(untitledNewestFirst, keepUntitled),
  ];
}

export async function pruneSpecRevisions(quoteId: string) {
  const [named, untitled] = await Promise.all([
    prisma.specRevision.findMany({
      where: { quoteId, NOT: { title: "" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.specRevision.findMany({
      where: { quoteId, title: "" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);
  const dropIds = specRevisionIdsToPrune(
    named.map((s) => s.id),
    untitled.map((s) => s.id),
  );
  if (dropIds.length === 0) return;
  await prisma.specRevision.deleteMany({ where: { id: { in: dropIds } } });
}

export async function writeSpecRevision(
  quoteId: string,
  lines: SpecLine[],
  createdById: string | null,
  note?: string,
  title = "",
) {
  const created = await prisma.specRevision.create({
    data: {
      quoteId,
      createdById,
      note: note || null,
      title,
      lines: specLinesToJson(lines) as Prisma.InputJsonValue,
    },
  });
  await pruneSpecRevisions(quoteId);
  return created;
}

export function linesFromRevision(raw: unknown): SpecLine[] {
  return parseSpecLines(raw);
}

export function specRevisionItemCount(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  return lines.filter(
    (row) =>
      row &&
      typeof row === "object" &&
      (row as { type?: string }).type === "ITEM",
  ).length;
}
