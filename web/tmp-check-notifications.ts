import { prisma } from "./src/lib/db";

async function main() {
  const rows = await prisma.notification.findMany({
    where: { body: { contains: "__layout_preview__" } },
    select: { id: true, userId: true, title: true, read: true },
  });
  const users = await prisma.user.findMany({
    where: { name: { contains: "Стрельченко" } },
    select: { id: true, name: true, email: true },
  });
  console.log(JSON.stringify({ rows, users }, null, 2));
  await prisma.$disconnect();
}

void main();
