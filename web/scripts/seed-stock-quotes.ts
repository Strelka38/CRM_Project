/**
 * Creates 3 overlapping quotes with the same catalog lines for stock UI testing.
 * Run: npx tsx scripts/seed-stock-quotes.ts
 */
import { PrismaClient, QuoteLifecycle } from "@prisma/client";

const prisma = new PrismaClient();

const ITEM_SPECS = [
  { name: "Ноутбук", qty: 2 },
  { name: "Акустическая стойка", qty: 4 },
  { name: "Микрофонная стойка", qty: 3 },
  { name: "Трибуна", qty: 1 },
] as const;

const QUOTES = [
  {
    proposalNumber: "ST-1",
    eventName: "Тест склад A",
    client: "Клиент А",
    date: "10.08.2026",
    lifecycle: QuoteLifecycle.CONFIRMED,
  },
  {
    proposalNumber: "ST-2",
    eventName: "Тест склад B",
    client: "Клиент Б",
    date: "10.08.2026",
    lifecycle: QuoteLifecycle.CONFIRMED,
  },
  {
    proposalNumber: "ST-3",
    eventName: "Тест склад C",
    client: "Клиент В",
    date: "10.08.2026",
    lifecycle: QuoteLifecycle.CALCULATED,
  },
] as const;

async function main() {
  const manager = await prisma.user.findFirst({
    where: { role: "MANAGER", active: true },
  });
  if (!manager) throw new Error("No manager user");

  const items = [];
  for (const spec of ITEM_SPECS) {
    const item = await prisma.catalogItem.findFirst({
      where: { name: spec.name, active: true },
    });
    if (!item) throw new Error(`Catalog item not found: ${spec.name}`);
    items.push({ ...spec, item });
  }

  // Remove previous test quotes with same numbers
  await prisma.quote.deleteMany({
    where: { proposalNumber: { in: QUOTES.map((q) => q.proposalNumber) } },
  });

  const eventDate = new Date(2026, 7, 10, 12);

  for (const q of QUOTES) {
    const created = await prisma.quote.create({
      data: {
        proposalNumber: q.proposalNumber,
        eventName: q.eventName,
        client: q.client,
        date: q.date,
        eventDate,
        time: "12:00",
        place: "Склад-тест",
        managerName: manager.name,
        durationDays: 1,
        lifecycle: q.lifecycle,
        ownerId: manager.id,
        brief: "Тестовая смета для проверки R / RT / T",
        blocks: {
          create: [
            {
              type: "SECTION",
              sortOrder: 0,
              title: "Оборудование",
            },
            ...items.map((it, i) => ({
              type: "ITEM" as const,
              sortOrder: i + 1,
              name: it.item.name,
              qty: it.qty,
              unitPrice: it.item.basePrice,
              dayMode: it.item.dayMode,
              catalogItemId: it.item.id,
            })),
          ],
        },
      },
    });
    console.log(
      `Created ${created.proposalNumber} ${created.eventName} (${created.lifecycle}) → /quotes/${created.id}`,
    );
  }

  console.log("\nItems:");
  for (const it of items) {
    console.log(`  ${it.name}: stock=${it.item.stockQty}, per quote qty=${it.qty}`);
  }
  console.log(
    "\nST-1 и ST-2 подтверждены на 10.08.2026 — в ST-3 смотрите RT и занятость.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
