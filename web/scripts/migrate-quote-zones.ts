/**
 * Ensure every quote has at least one zone «Основное» and all blocks have zoneId.
 * Run: npx tsx scripts/migrate-quote-zones.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const quotes = await prisma.quote.findMany({
    select: {
      id: true,
      zones: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      blocks: { select: { id: true, zoneId: true } },
    },
  });

  let createdZones = 0;
  let linkedBlocks = 0;

  for (const q of quotes) {
    let zoneId = q.zones[0]?.id;
    if (!zoneId) {
      const zone = await prisma.quoteZone.create({
        data: { quoteId: q.id, name: "Основное", sortOrder: 0 },
      });
      zoneId = zone.id;
      createdZones += 1;
    }

    const orphanIds = q.blocks.filter((b) => !b.zoneId).map((b) => b.id);
    if (orphanIds.length > 0) {
      const res = await prisma.quoteBlock.updateMany({
        where: { id: { in: orphanIds } },
        data: { zoneId },
      });
      linkedBlocks += res.count;
    }
  }

  console.log(
    `Done. Created zones: ${createdZones}. Linked blocks: ${linkedBlocks}. Quotes: ${quotes.length}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
