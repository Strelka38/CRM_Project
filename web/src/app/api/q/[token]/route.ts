import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureEquipmentCode } from "@/lib/equipment";
import { canSendEquipmentToRepair } from "@/lib/roles";

/** Публичные данные единицы оборудования по QR-токену. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const session = await auth();
    const loggedIn = !!session?.user?.id;
    const canRepair = canSendEquipmentToRepair(session?.user?.role);

    const unit = await prisma.equipmentUnit.findFirst({
      where: { qrToken: token, active: true },
      include: {
        catalogItem: {
          include: {
            category: { select: { id: true, name: true, path: true } },
            equipmentDocuments: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                filename: true,
                mimeType: true,
                size: true,
                description: true,
                createdAt: true,
              },
            },
          },
        },
        repairs: {
          orderBy: { reportedAt: "desc" as const },
          include: {
            reportedBy: { select: { id: true, name: true } },
            photos: {
              orderBy: { createdAt: "asc" as const },
              select: { id: true, filename: true, mimeType: true, size: true },
            },
          },
        },
      },
    });

    if (!unit || !unit.catalogItem.active) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await ensureEquipmentCode(unit.catalogItemId);

    const item = await prisma.catalogItem.findUnique({
      where: { id: unit.catalogItemId },
      select: {
        id: true,
        name: true,
        model: true,
        manufacturer: true,
        stockQty: true,
        power: true,
        weight: true,
        width: true,
        height: true,
        depth: true,
        comment: true,
        photoPath: true,
        equipmentCode: true,
        category: { select: { id: true, name: true, path: true } },
        equipmentDocuments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            description: true,
            createdAt: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const documents = item.equipmentDocuments.map((d) => ({
      ...d,
      fileUrl: `/api/q/${encodeURIComponent(token)}/documents/${d.id}/file`,
    }));

    const repairs = loggedIn
      ? unit.repairs.map((r) => ({
          id: r.id,
          status: r.status,
          faultType: r.faultType,
          comment: r.comment,
          resolutionComment: r.resolutionComment,
          reportedAt: r.reportedAt,
          resolvedAt: r.resolvedAt,
          reportedBy: r.reportedBy,
          photos: r.photos.map((p) => ({
            ...p,
            fileUrl: `/api/q/${encodeURIComponent(token)}/repair-photos/${p.id}/file`,
          })),
        }))
      : [];

    const openRepair = repairs.find((r) => r.status === "OPEN") ?? null;

    return NextResponse.json({
      viewer: {
        loggedIn,
        canSendToRepair: canRepair && !unit.inRepair,
      },
      unit: {
        id: unit.id,
        unitNumber: unit.unitNumber,
        label: unit.label,
        qrToken: unit.qrToken,
        inRepair: unit.inRepair,
      },
      item: {
        id: item.id,
        name: item.name,
        model: item.model,
        manufacturer: item.manufacturer,
        stockQty: item.stockQty,
        power: item.power,
        weight: item.weight,
        width: item.width,
        height: item.height,
        depth: item.depth,
        comment: item.comment,
        photoPath: item.photoPath,
        equipmentCode: item.equipmentCode,
        category: item.category,
        photoUrl: item.photoPath
          ? `/api/q/${encodeURIComponent(token)}/photo`
          : null,
      },
      documents,
      openRepair,
      repairs,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
