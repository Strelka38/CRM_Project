import { prisma } from "./db";

export async function syncClientLegalMirror(clientId: string) {
  const first = await prisma.clientLegalEntity.findFirst({
    where: { clientId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  await prisma.client.update({
    where: { id: clientId },
    data: {
      inn: first?.inn ?? "",
      legalAddress: first?.legalAddress ?? "",
      legalDetails: first?.legalDetails ?? "",
    },
  });
}

export async function nextLegalSort(clientId: string) {
  const last = await prisma.clientLegalEntity.findFirst({
    where: { clientId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

/** CSV и старые карточки держат реквизиты плоско. Первое юрлицо повторяет их. */
export async function upsertFlatLegalEntity(
  clientId: string,
  flat: { name: string; inn: string; legalAddress: string; legalDetails: string },
) {
  const inn = flat.inn.trim();
  const legalAddress = flat.legalAddress.trim();
  const legalDetails = flat.legalDetails.trim();
  if (!inn && !legalAddress && !legalDetails) return;
  const first = await prisma.clientLegalEntity.findFirst({
    where: { clientId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!first) {
    await prisma.clientLegalEntity.create({
      data: {
        clientId,
        name: flat.name.trim() || "Юрлицо",
        inn,
        legalAddress,
        legalDetails,
      },
    });
    return;
  }
  await prisma.clientLegalEntity.update({
    where: { id: first.id },
    data: { inn, legalAddress, legalDetails },
  });
}
