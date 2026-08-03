/**
 * Self-contained (no imports from src/) so it runs in the Docker runner image.
 */
import { PrismaClient } from "@prisma/client";

const statements = [
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDate" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDurationDays" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDate" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDurationDays" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "QuoteComment" ALTER COLUMN "body" SET DEFAULT ''`,
  `ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imagePath" TEXT`,
  `ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageMime" TEXT`,
  `ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageName" TEXT`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
    console.log("ensure-schema: ok");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ensure-schema: failed", e);
  process.exit(1);
});
