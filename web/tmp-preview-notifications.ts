import { prisma } from "./src/lib/db";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "manager@local.test" },
    select: { id: true },
  });
  if (!user) throw new Error("manager not found");
  const quote = await prisma.quote.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, proposalNumber: true, eventName: true },
  });
  const now = new Date();
  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        quoteId: quote?.id,
        type: "EVENT_CREATED",
        title: "Новое мероприятие",
        body: `Добавлено мероприятие КП №${quote?.proposalNumber ?? "—"}. __layout_preview__`,
        read: false,
        createdAt: now,
      },
      {
        userId: user.id,
        quoteId: quote?.id,
        type: "EVENT_ASSIGNED",
        title: "Вас назначили на мероприятие",
        body: `Вы заняты на мероприятии «${quote?.eventName || "Тест"}». __layout_preview__`,
        read: false,
        createdAt: new Date(now.getTime() - 3600e3),
      },
      {
        userId: user.id,
        quoteId: quote?.id,
        type: "INVOICE_DUE",
        title: "Нужно отправить счёт заказчику",
        body: "Мероприятие завершено. Отправьте счёт. __layout_preview__",
        read: true,
        createdAt: new Date(now.getTime() - 86400e3 * 3),
      },
    ],
  });
  console.log("ok", user.id);
  await prisma.$disconnect();
}

void main();