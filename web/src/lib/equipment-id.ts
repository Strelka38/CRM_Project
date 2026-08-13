/** Отображаемый ID единицы: {equipmentCode}-{unitNumber}, напр. 1001-3 */
export function formatUnitId(
  equipmentCode: number | null | undefined,
  unitNumber: number,
) {
  if (equipmentCode == null) return `#${unitNumber}`;
  return `${equipmentCode}-${unitNumber}`;
}
