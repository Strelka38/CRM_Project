/** Цвета таблиц сметы (светлая тема сайта). */
export const ESTIMATE_COLORS = {
  ink: [15, 23, 41] as [number, number, number],
  muted: [90, 107, 130] as [number, number, number],
  line: [208, 217, 230] as [number, number, number],
  header: [238, 243, 248] as [number, number, number],
  zone: [235, 247, 252] as [number, number, number],
  category: [214, 238, 249] as [number, number, number],
  total: [240, 249, 253] as [number, number, number],
  inkArgb: "FF0F1729",
  mutedArgb: "FF5A6B82",
  lineArgb: "FFD0D9E6",
  headerArgb: "FFEEF3F8",
  zoneArgb: "FFEBF7FC",
  categoryArgb: "FFD6EEF9",
  totalArgb: "FFF0F9FD",
};

export const ESTIMATE_DISCLAIMER =
  "Внимание: данное предложение не является офертой. Предложение действительно 7 дней. Бронирование оборудования на вашу дату производится только после заключения договора или внесения предоплаты. В стоимости учтены один день монтажа и один день мероприятия с возможными репетициями в день мероприятия. 2-й и последующий дни мероприятия, а также отдельный день для репетиций или декорирования тарифицируются по 50% от стоимости оборудования + 100% стоимости технических специалистов, если они требуются. Полная готовность оборудования обеспечивается в день мероприятия. Оплата возможна по безналичному расчету на счет ИП без НДС, а также через СБП или банковской картой через интернет-эквайринг (по ссылке).";

/** Минимум места на странице, чтобы начать зону (заголовок + шапка + пара строк). */
export const MIN_ZONE_BLOCK_MM = 42;

export function remainingPageMm(
  pageHeight: number,
  y: number,
  bottomMargin: number,
) {
  return pageHeight - bottomMargin - y;
}

export function shouldStartNewPage(
  remainingMm: number,
  minBlockMm = MIN_ZONE_BLOCK_MM,
) {
  return remainingMm < minBlockMm;
}

export type EstimateKind = "equipment" | "service" | "consumable";

export function partitionByKind<T>(
  items: T[],
  kindOf: (item: T) => EstimateKind,
): { rental: T[]; services: T[] } {
  const rental: T[] = [];
  const services: T[] = [];
  for (const item of items) {
    if (kindOf(item) === "service") services.push(item);
    else rental.push(item);
  }
  return { rental, services };
}

export function formatEstimateNumber(value: number): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
