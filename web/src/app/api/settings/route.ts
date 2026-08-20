import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMasterTimezone, setMasterTimezone } from "@/lib/app-settings";
import { TIMEZONES, isKnownTimezone } from "@/lib/timezone";
import { requireAdmin, requireSession } from "@/lib/session";

export async function GET() {
  try {
    await requireSession();
    const masterTimezone = await getMasterTimezone();
    return NextResponse.json({ masterTimezone, timezones: TIMEZONES });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Не удалось загрузить настройки" }, { status: 500 });
  }
}

const patchSchema = z.object({
  masterTimezone: z.string().min(1),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await req.json());
    if (!isKnownTimezone(body.masterTimezone)) {
      return NextResponse.json({ error: "Неизвестный часовой пояс" }, { status: 400 });
    }
    const masterTimezone = await setMasterTimezone(body.masterTimezone);
    return NextResponse.json({ masterTimezone });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
