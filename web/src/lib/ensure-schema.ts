import { prisma } from "@/lib/db";

/**
 * Idempotent ALTER TABLEs for prod drift (migrate history may claim
 * applied while columns are still missing).
 */
export async function ensureQuoteSchemaColumns() {
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

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      console.error("ensureQuoteSchemaColumns failed:", sql, e);
      throw e;
    }
  }
}
