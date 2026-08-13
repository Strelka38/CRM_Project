export const EQUIPMENT_FAULT_TYPES = [
  { id: "no_power", label: "Не включается" },
  { id: "no_signal", label: "Нет сигнала / связи" },
  { id: "cable", label: "Кабель / разъём" },
  { id: "housing", label: "Корпус / механика" },
  { id: "optics", label: "Оптика / лампа" },
  { id: "overheat", label: "Перегрев" },
  { id: "other", label: "Другое" },
] as const;

export type EquipmentFaultTypeId = (typeof EQUIPMENT_FAULT_TYPES)[number]["id"];

const FAULT_LABELS = Object.fromEntries(
  EQUIPMENT_FAULT_TYPES.map((t) => [t.id, t.label]),
) as Record<string, string>;

export function isEquipmentFaultType(value: string): value is EquipmentFaultTypeId {
  return value in FAULT_LABELS;
}

export function faultTypeLabel(id: string) {
  return FAULT_LABELS[id] || id;
}
