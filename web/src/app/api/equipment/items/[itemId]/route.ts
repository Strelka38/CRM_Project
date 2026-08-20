import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  addEquipmentUnit,
  ensureEquipmentCode,
  equipmentItemInclude,
  syncEquipmentUnits,
} from "@/lib/equipment";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess } from "@/lib/session";

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      throw e;
    });
  }
  return ensureOnce;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureSchemaOnce();
    const { itemId } = await params;

    const exists = await prisma.catalogItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await ensureEquipmentCode(itemId);

    const item = await prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: equipmentItemInclude,
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/** POST { sync: true } — создать недостающие единицы до stockQty */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { itemId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      sync?: boolean;
      addUnit?: boolean;
    };

    const item = await prisma.catalogItem.findUnique({
      where: { id: itemId },
      select: { id: true, stockQty: true, active: true },
    });
    if (!item || !item.active) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await ensureEquipmentCode(itemId);

    if (body.addUnit) {
      try {
        await addEquipmentUnit(itemId);
      } catch (e) {
        if (e instanceof Error && e.message === "NOT_FOUND") {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        throw e;
      }
      const full = await prisma.catalogItem.findUnique({
        where: { id: itemId },
        include: equipmentItemInclude,
      });
      return NextResponse.json({ item: full });
    }

    if (body.sync) {
      const units = await syncEquipmentUnits(itemId, item.stockQty);
      const full = await prisma.catalogItem.findUnique({
        where: { id: itemId },
        include: equipmentItemInclude,
      });
      return NextResponse.json({ item: full, units });
    }

    return NextResponse.json(
      { error: "Укажите addUnit или sync" },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
