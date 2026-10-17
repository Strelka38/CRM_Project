import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMasterTimezone, setMasterTimezone } from "@/lib/app-settings";
import { CURRENCIES, getOrgSettings, saveOrgSettings } from "@/lib/org-settings";
import { parseSpecPrint } from "@/lib/spec-print";
import { TIMEZONES, isKnownTimezone } from "@/lib/timezone";
import { requireAdmin, requireSession } from "@/lib/session";

export async function GET() {
  try {
    await requireSession();
    const [masterTimezone, org] = await Promise.all([
      getMasterTimezone(),
      getOrgSettings(),
    ]);
    return NextResponse.json({
      masterTimezone,
      timezones: TIMEZONES,
      currencies: CURRENCIES,
      ...org,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Не удалось загрузить настройки" }, { status: 500 });
  }
}

const patchSchema = z
  .object({
    masterTimezone: z.string().min(1).optional(),
    currency: z.string().optional(),
    showWhatsNew: z.boolean().optional(),
    deficitScope: z.enum(["project", "period"]).optional(),
    specPrint: z.unknown().optional(),
    kpDefaultTemplateId: z.string().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Нет полей",
  });

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await req.json());
    if (body.masterTimezone && !isKnownTimezone(body.masterTimezone)) {
      return NextResponse.json({ error: "Неизвестный часовой пояс" }, { status: 400 });
    }
    const masterTimezone = body.masterTimezone
      ? await setMasterTimezone(body.masterTimezone)
      : await getMasterTimezone();
    const org = await saveOrgSettings({
      currency: body.currency as never,
      showWhatsNew: body.showWhatsNew,
      deficitScope: body.deficitScope,
      specPrint: body.specPrint === undefined ? undefined : parseSpecPrint(body.specPrint),
      kpDefaultTemplateId: body.kpDefaultTemplateId,
    });
    return NextResponse.json({ masterTimezone, timezones: TIMEZONES, currencies: CURRENCIES, ...org });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
