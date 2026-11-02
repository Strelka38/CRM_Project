import { prisma } from "./db";

export const contactSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  sortOrder: true,
} as const;

export async function nextContactSort(clientId: string) {
  const last = await prisma.clientContact.findFirst({
    where: { clientId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

/** Первое контактное лицо дублируется в плоские поля Client — их читают поиск и старые КП. */
export async function syncClientContactMirror(clientId: string) {
  const first = await prisma.clientContact.findFirst({
    where: { clientId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  await prisma.client.update({
    where: { id: clientId },
    data: {
      contactName: first?.name ?? "",
      phone: first?.phone ?? "",
      email: first?.email ?? "",
    },
  });
}

/** CSV и создание клиента пишут контакт плоско. Первая запись повторяет эти поля. */
export async function upsertFlatContact(
  clientId: string,
  flat: { name: string; phone: string; email: string },
) {
  const name = flat.name.trim();
  const phone = flat.phone.trim();
  const email = flat.email.trim();
  if (!name && !phone && !email) return;
  const first = await prisma.clientContact.findFirst({
    where: { clientId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!first) {
    await prisma.clientContact.create({
      data: { clientId, name, phone, email, sortOrder: 0 },
    });
    return;
  }
  await prisma.clientContact.update({
    where: { id: first.id },
    data: { name, phone, email },
  });
}
