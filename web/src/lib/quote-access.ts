import { prisma } from "@/lib/db";

export async function getAccessibleQuote(
  id: string,
  userId: string,
  role: string,
) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      zones: { orderBy: { sortOrder: "asc" } },
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: {
          catalogItem: { select: { id: true, itemKind: true } },
        },
      },
      owner: { select: { id: true, name: true, email: true } },
      clientRef: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          email: true,
          inn: true,
        },
      },
    },
  });
  if (!quote) return null;
  if (role === "MANAGER") return quote;
  // Полные данные сметы — только если сотрудник назначен на мероприятие
  const assigned = await prisma.quoteAssignment.findFirst({
    where: { quoteId: id, userId },
    select: { id: true },
  });
  return assigned ? quote : null;
}

/** Карточка проекта / спецификация / комментарии — любой авторизованный пользователь (календарь общий). */
export async function canAccessQuote(
  id: string,
  _userId: string,
  _role: string,
): Promise<boolean> {
  const q = await prisma.quote.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(q);
}

/** Ensure quote has at least one zone; return it. */
export async function ensureDefaultZone(quoteId: string) {
  const existing = await prisma.quoteZone.findFirst({
    where: { quoteId },
    orderBy: { sortOrder: "asc" },
  });
  if (existing) return existing;
  return prisma.quoteZone.create({
    data: { quoteId, name: "Основное", sortOrder: 0 },
  });
}
