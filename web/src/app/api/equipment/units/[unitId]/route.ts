import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import {
  restoreWrittenOffEquipmentUnit,
  writeOffEquipmentUnit,
} from "@/lib/equipment";
import {
  isAdmin,
  requireAdmin,
  requireDatabaseAccess,
} from "@/lib/session";
import { deleteUploadFile } from "@/lib/uploads";

const OWNER_VALUES = new Set<string>(CATALOG_OWNERS.map((o) => o.value));

function parseOwnerPatch(
  value: unknown,
): { ok: true; owner: CatalogOwnerValue | null } | { ok: false } {
  if (value === null || value === "") return { ok: true, owner: null };
  if (typeof value === "string" && OWNER_VALUES.has(value)) {
    return { ok: true, owner: value as CatalogOwnerValue };
  }
  return { ok: false };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    const session = await requireDatabaseAccess();
    const { unitId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      label?: string | null;
      owner?: string | null;
      writeOff?: boolean;
      restoreWriteOff?: boolean;
      reason?: string;
      comment?: string;
    };

    const unit = await prisma.equipmentUnit.findUnique({
      where: { id: unitId },
      select: { id: true, active: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.writeOff) {
      const reason = body.reason === "LOST" ? "LOST" : body.reason === "DAMAGED" ? "DAMAGED" : "";
      if (!reason) {
        return NextResponse.json(
          { error: "Укажите причину: повреждено или утеряно" },
          { status: 400 },
        );
      }
      if (!unit.active) {
        return NextResponse.json({ error: "Единица уже списана" }, { status: 409 });
      }
      try {
        await writeOffEquipmentUnit({
          unitId,
          reason,
          comment: String(body.comment || "").trim(),
        });
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        throw e;
      }
      return NextResponse.json({ ok: true });
    }

    if (body.restoreWriteOff) {
      if (!isAdmin(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      try {
        await restoreWrittenOffEquipmentUnit(unitId);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (e instanceof Error && e.message === "NOT_WRITTEN_OFF") {
          return NextResponse.json(
            { error: "Единица не списана" },
            { status: 409 },
          );
        }
        if (e instanceof Error && e.message === "ITEM_INACTIVE") {
          return NextResponse.json(
            { error: "Сначала восстановите позицию каталога" },
            { status: 409 },
          );
        }
        throw e;
      }
      return NextResponse.json({ ok: true });
    }

    const data: { label?: string | null; owner?: CatalogOwnerValue | null } = {};
    if ("label" in body) {
      data.label =
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim()
          : null;
    }
    if ("owner" in body) {
      const parsed = parseOwnerPatch(body.owner);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: "Склад: укажите ШМ, ДК или NE" },
          { status: 400 },
        );
      }
      data.owner = parsed.owner;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Нечего обновить" }, { status: 400 });
    }
    const updated = await prisma.equipmentUnit.update({
      where: { id: unitId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/equipment/units/id]", e);
    return NextResponse.json(
      { error: "Не удалось обновить единицу" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> },
) {
  try {
    await requireAdmin();
    const { unitId } = await params;
    const unit = await prisma.equipmentUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        catalogItemId: true,
        repairs: {
          select: {
            photos: { select: { storagePath: true } },
          },
        },
      },
    });
    if (!unit) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.equipmentUnit.delete({ where: { id: unit.id } });
      const available = await tx.equipmentUnit.count({
        where: {
          catalogItemId: unit.catalogItemId,
          active: true,
          inRepair: false,
        },
      });
      await tx.catalogItem.update({
        where: { id: unit.catalogItemId },
        data: { stockQty: available },
      });
    });

    await Promise.all(
      unit.repairs.flatMap((repair) =>
        repair.photos.map((photo) => deleteUploadFile(photo.storagePath)),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/equipment/units/id]", e);
    return NextResponse.json(
      { error: "Не удалось полностью удалить единицу" },
      { status: 500 },
    );
  }
}
