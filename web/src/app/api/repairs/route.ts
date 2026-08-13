import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRepairsAccess } from "@/lib/session";

export async function GET() {
  try {
    await requireRepairsAccess();
    const repairs = await prisma.equipmentRepair.findMany({
      where: { status: "OPEN" },
      orderBy: { reportedAt: "desc" },
      include: {
        reportedBy: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
        photos: {
          orderBy: { createdAt: "asc" },
          select: { id: true, filename: true, mimeType: true, size: true },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            qrToken: true,
            label: true,
            catalogItem: {
              select: {
                id: true,
                name: true,
                model: true,
                equipmentCode: true,
                category: { select: { path: true } },
              },
            },
          },
        },
      },
    });
    return NextResponse.json(repairs);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/repairs]", e);
    return NextResponse.json(
      { error: "Не удалось загрузить ремонт" },
      { status: 500 },
    );
  }
}
