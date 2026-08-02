import { prisma } from "@/lib/db";

/** Next КП number = max numeric proposalNumber among all quotes + 1. */
export async function nextProposalNumber(): Promise<string> {
  const quotes = await prisma.quote.findMany({
    select: { proposalNumber: true },
  });
  let max = 0;
  for (const q of quotes) {
    const n = Number.parseInt(q.proposalNumber, 10);
    if (
      Number.isFinite(n) &&
      n > max &&
      String(n) === q.proposalNumber.trim()
    ) {
      max = n;
    }
  }
  return String(max + 1);
}
