import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  compactPermissionOverrides,
  parsePermissionOverrides,
  type RolePermissionOverrides,
} from "@/lib/permission-tree";
import { saveRolePermissionOverrides } from "@/lib/role-permissions";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    const session = await requireAdmin();
    return NextResponse.json({ overrides: session.permissions });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: "Не удалось загрузить права" },
      { status: 500 },
    );
  }
}

const bodySchema = z.object({
  overrides: z.unknown().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = bodySchema.parse(await req.json());
    const parsed = parsePermissionOverrides(body.overrides ?? {});
    const overrides = await saveRolePermissionOverrides(
      parsed as RolePermissionOverrides,
    );
    return NextResponse.json({
      overrides: compactPermissionOverrides(overrides),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
