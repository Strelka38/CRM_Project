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

/** Paid quotes no longer need «отправьте счёт» — drop those notices. */
export async function clearInvoiceDueNotifications(quoteId?: string) {
  await prisma.notification.deleteMany({
    where: {
      type: "INVOICE_DUE",
      ...(quoteId
        ? { quoteId }
        : { quote: { paid: true } }),
    },
  });
}

/** After confirmed event ends — flag invoice + notify owner */
export async function syncInvoiceNotifications() {
  await clearInvoiceDueNotifications();
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

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Просроченные незакрытые задачи — уведомление менеджерам и бригадирам. */
export async function syncOpenTaskNotifications() {
  const todayUtc = utcDateOnly(startOfDay(new Date()));

  await prisma.notification.deleteMany({
    where: {
      type: "TASK_OPEN",
      calendarEntry: { is: { completedAt: { not: null } } },
    },
  });

  const open = await prisma.calendarEntry.findMany({
    where: {
      kind: "TASK",
      completedAt: null,
      date: { lt: todayUtc },
    },
    select: {
      id: true,
      title: true,
      date: true,
    },
    take: 40,
  });
  if (open.length === 0) return { created: 0 };

  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER", "BRIGADIER"] }, active: true },
    select: { id: true },
  });
  if (staff.length === 0) return { created: 0 };

  let created = 0;
  for (const task of open) {
    const title = task.title.trim() || "Задача";
    const when = formatTaskDate(task.date);
    const body = `Задача «${title}» на ${when} не закрыта.`;
    for (const u of staff) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: u.id,
          calendarEntryId: task.id,
          type: "TASK_OPEN",
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.notification.create({
        data: {
          userId: u.id,
          calendarEntryId: task.id,
          type: "TASK_OPEN",
          title: "Задача не закрыта",
          body,
        },
      });
      created += 1;
    }
  }
  return { created };
}

export async function clearOpenTaskNotifications(entryId: string) {
  await prisma.notification.deleteMany({
    where: { calendarEntryId: entryId, type: "TASK_OPEN" },
  });
}

function formatTaskDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${m}.${d.getUTCFullYear()}`;
}

/** Managers and brigadiers get notified about every new event (except the creator). */
export async function notifyManagersOfNewEvent(quote: {
  id: string;
  eventName: string;
  proposalNumber: string;
  ownerId: string;
  date?: string;
  managerName?: string;
}) {
  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "MANAGER", "BRIGADIER"] },
      active: true,
      id: { not: quote.ownerId },
    },
    select: { id: true },
  });
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

/** Бригадирам — задача на монтаж при первом переходе сметы в CONFIRMED. */
export async function notifyBrigadiersOfConfirmedMount(quote: {
  id: string;
  eventName: string;
  proposalNumber: string;
  date?: string;
}) {
  const already = await prisma.notification.findFirst({
    where: { quoteId: quote.id, type: "MOUNT_CONFIRMED" },
    select: { id: true },
  });
  if (already) return;

  const brigadiers = await prisma.user.findMany({
    where: { role: "BRIGADIER", active: true },
    select: { id: true },
  });
  if (brigadiers.length === 0) return;

  const label = eventLabel(quote.eventName, quote.proposalNumber);
  const when = quote.date?.trim() ? ` на ${quote.date.trim()}` : "";

  await prisma.notification.createMany({
    data: brigadiers.map((u) => ({
      userId: u.id,
      quoteId: quote.id,
      type: "MOUNT_CONFIRMED" as const,
      title: "Нужны монтажники",
      body: `Смета ${label} подтверждена${when}. Назначьте бригаду на вкладке «Монтажники».`,
    })),
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
        .filter(
          (id): id is string => Boolean(id) && id !== opts.authorId,
        ),
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
