import { prisma } from "./db";
import { DEFAULT_TIMEZONE, isKnownTimezone } from "./timezone";

const MASTER_TZ_KEY = "masterTimezone";

export async function getMasterTimezone(): Promise<string> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: MASTER_TZ_KEY },
    });
    if (row && isKnownTimezone(row.value)) return row.value;
  } catch {
    /* table may not exist yet */
  }
  return DEFAULT_TIMEZONE;
}

export async function setMasterTimezone(value: string): Promise<string> {
  const next = isKnownTimezone(value) ? value : DEFAULT_TIMEZONE;
  await prisma.appSetting.upsert({
    where: { key: MASTER_TZ_KEY },
    create: { key: MASTER_TZ_KEY, value: next },
    update: { value: next },
  });
  return next;
}

export function userTimezoneOrMaster(
  userTz: string | null | undefined,
  masterTz: string,
): string {
  if (isKnownTimezone(userTz)) return userTz!;
  return isKnownTimezone(masterTz) ? masterTz : DEFAULT_TIMEZONE;
}
