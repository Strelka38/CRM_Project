/** Сводная ведомость и имя вкладки нужны, только когда вкладок две и больше. */
export function quoteSheetShowsIdentity(zoneCount: number): boolean {
  return zoneCount >= 2;
}
