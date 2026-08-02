import { prisma } from "./db";
import { addDays, startOfDay } from "./dates";

function eventLabel(eventName: string | null | undefined, proposalNumber: string) {
  const name = eventName?.trim();
  return name ? `«${name}»` : `КП №${proposalNumber}`;
}

function previewText(text: string, max = 120) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** After confirmed event ends — flag invoice + notify owner */
export async function syncInvoiceNotifications() {
  const today = startOfDay(new Date());
  const candidates = await prisma.quote.findMany({
    where: {
      lifecycle: "CONFIRMED",
      eventDate: { not: null },
      invoiceRequired: false,
      paid: false,
    },
    include: { owner: true },
  });

  let created = 0;
  for (const q of candidates) {
    if (!q.eventDate) continue;
    const eventEnd = addDays(startOfDay(q.eventDate), Math.max(1, q.durationDays));
    if (eventEnd.getTime() > today.getTime()) continue;

    await prisma.quote.update({
      where: { id: q.id },
      data: { invoiceRequired: true },
    });

    const title = "Нужно отправить счёт заказчику";
    const body = `Мероприятие ${eventLabel(q.eventName, q.proposalNumber)} завершено. Отправьте счёт и отметьте оплату.`;

    const existing = await prisma.notification.findFirst({
      where: {
        quoteId: q.id,
        type: "INVOICE_DUE",
        userId: q.ownerId,
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: q.ownerId,
          quoteId: q.id,
          type: "INVOICE_DUE",
          title,
          body,
        },
      });
      created += 1;
    }
  }
  return { processed: candidates.length, created };
}

/** Managers get notified about every new event (except the creator). */
export async function notifyManagersOfNewEvent(quote: {
  id: string;
  eventName: string;
  proposalNumber: string;
  ownerId: string;
  date?: string;
  managerName?: string;
}) {
  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });

  const recipients = managers.filter((m) => m.id !== quote.ownerId);
  if (recipients.length === 0) return;

  const label = eventLabel(quote.eventName, quote.proposalNumber);
  const when = quote.date?.trim() ? ` на ${quote.date.trim()}` : "";
  const by = quote.managerName?.trim()
    ? ` Создал: ${quote.managerName.trim()}.`
    : "";

  await prisma.notification.createMany({
    data: recipients.map((m) => ({
      userId: m.id,
      quoteId: quote.id,
      type: "EVENT_CREATED" as const,
      title: "Новое мероприятие",
      body: `Добавлено мероприятие ${label}${when}.${by}`,
    })),
  });
}

/** Employee gets notified when first assigned to an event. */
export async function notifyEmployeeOfAssignment(quote: {
  id: string;
  eventName: string;
  proposalNumber: string;
  date?: string;
}, userId: string, specialtyName?: string) {
  const existing = await prisma.notification.findFirst({
    where: {
      quoteId: quote.id,
      userId,
      type: "EVENT_ASSIGNED",
    },
  });
  if (existing) return;

  const label = eventLabel(quote.eventName, quote.proposalNumber);
  const when = quote.date?.trim() ? ` (${quote.date.trim()})` : "";
  const role = specialtyName?.trim() ? ` как ${specialtyName.trim()}` : "";

  await prisma.notification.create({
    data: {
      userId,
      quoteId: quote.id,
      type: "EVENT_ASSIGNED",
      title: "Вас назначили на мероприятие",
      body: `Вы заняты на мероприятии ${label}${when}${role}.`,
    },
  });
}

/** Assigned workers get notified about new chat messages (not the author). */
export async function notifyWorkersOfChatMessage(opts: {
  quoteId: string;
  authorId: string;
  authorName: string;
  message: string;
}) {
  const quote = await prisma.quote.findUnique({
    where: { id: opts.quoteId },
    select: {
      id: true,
      eventName: true,
      proposalNumber: true,
      assignments: { select: { userId: true } },
    },
  });
  if (!quote) return;

  const workerIds = [
    ...new Set(
      quote.assignments
        .map((a) => a.userId)
        .filter((id) => id !== opts.authorId),
    ),
  ];
  if (workerIds.length === 0) return;

  const label = eventLabel(quote.eventName, quote.proposalNumber);
  const preview = previewText(opts.message);

  await prisma.notification.createMany({
    data: workerIds.map((userId) => ({
      userId,
      quoteId: quote.id,
      type: "CHAT_MESSAGE" as const,
      title: `Сообщение: ${label}`,
      body: `${opts.authorName}: ${preview}`,
    })),
  });
}
