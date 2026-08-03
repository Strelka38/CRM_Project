import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: string;
};

/** Bump when schema models change so hot-reload doesn't keep a stale client. */
const SCHEMA_VERSION = "quote-mount-demount-dates-v1";

function getClient() {
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaSchemaVersion === SCHEMA_VERSION
  ) {
    return globalForPrisma.prisma;
  }
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => {});
  }
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
  }
  return client;
}

export const prisma = getClient();
