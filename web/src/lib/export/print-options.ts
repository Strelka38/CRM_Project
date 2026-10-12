import { todayLabel } from "../format";

/** Поля печати коммерческого предложения. Нет флага — старое поведение экспорта. */
export type QuotePrintOptions = {
  showFormedAt: boolean;
  showProjectNumber: boolean;
  showFirm: boolean;
  showProjectName: boolean;
  showEventDate: boolean;
  showEventTime: boolean;
  showClient: boolean;
  showClientPhone: boolean;
  showVenue: boolean;
  showAddress: boolean;
  showLinePrice: boolean;
  showLineCoef: boolean;
  showLineDiscount: boolean;
  showSectionTotal: boolean;
  showQuoteTotal: boolean;
  showNote: boolean;
  showComment: boolean;
  showZeroLines: boolean;
  showPageNumbers: boolean;
  showSectionHeader: boolean;
  showSubsectionHeader: boolean;
  /** Наличка в строках, налог безнала отдельной суммой. false — налог уже в сумме строки. */
  showTaxSeparate: boolean;
};

/** Как на экране опций: дата формирования, цены, итоги, примечание, нумерация. */
export const STANDARD_PRINT_OPTIONS: QuotePrintOptions = {
  showFormedAt: true,
  showProjectNumber: false,
  showFirm: false,
  showProjectName: false,
  showEventDate: false,
  showEventTime: false,
  showClient: false,
  showClientPhone: false,
  showVenue: false,
  showAddress: false,
  showLinePrice: true,
  showLineCoef: false,
  showLineDiscount: false,
  showSectionTotal: true,
  showQuoteTotal: true,
  showNote: true,
  showComment: false,
  showZeroLines: true,
  showPageNumbers: true,
  showSectionHeader: false,
  showSubsectionHeader: false,
  showTaxSeparate: true,
};

export type ExportOptionRow =
  | { kind: "print"; key: keyof QuotePrintOptions; label: string; caps?: boolean }
  | {
      kind: "filter";
      key:
        | "includeSummary"
        | "allTabsOneSheet"
        | "showEquipmentPrice"
        | "showConsumablePrice"
        | "showServicePrice";
      label: string;
    }
  | { kind: "gap" };

export const EXPORT_OPTION_ROWS: ExportOptionRow[] = [
  { kind: "print", key: "showFormedAt", label: "Дата формирования", caps: true },
  { kind: "print", key: "showProjectNumber", label: "Номер проекта", caps: true },
  { kind: "print", key: "showFirm", label: "Фирма", caps: true },
  { kind: "print", key: "showProjectName", label: "Название проекта", caps: true },
  { kind: "print", key: "showEventDate", label: "Дата проведения", caps: true },
  { kind: "print", key: "showEventTime", label: "Время проведения", caps: true },
  { kind: "print", key: "showClient", label: "Клиент", caps: true },
  { kind: "print", key: "showClientPhone", label: "Телефон клиента", caps: true },
  { kind: "print", key: "showVenue", label: "Площадка", caps: true },
  { kind: "print", key: "showAddress", label: "Адрес", caps: true },
  { kind: "gap" },
  { kind: "print", key: "showLinePrice", label: "Показывать цену для позиции" },
  { kind: "print", key: "showLineCoef", label: "Показывать коэф для позиции" },
  { kind: "print", key: "showLineDiscount", label: "Показывать скидку для позиции" },
  { kind: "print", key: "showSectionTotal", label: "Показывать итого по разделу" },
  { kind: "print", key: "showQuoteTotal", label: "Показывать итого по смете" },
  { kind: "gap" },
  { kind: "print", key: "showNote", label: "Показывать примечание" },
  { kind: "print", key: "showComment", label: "Показывать комментарий" },
  { kind: "print", key: "showZeroLines", label: "Показывать нулевые позиции" },
  { kind: "print", key: "showPageNumbers", label: "Показывать нумерацию страниц" },
  { kind: "gap" },
  { kind: "print", key: "showSectionHeader", label: "Показывать заголовок раздела" },
  { kind: "print", key: "showSubsectionHeader", label: "Показывать заголовок подраздела" },
  { kind: "gap" },
  { kind: "filter", key: "includeSummary", label: "Сводная ведомость" },
  {
    kind: "filter",
    key: "allTabsOneSheet",
    label: "Все вкладки на одном листе (только .xls)",
  },
  { kind: "filter", key: "showEquipmentPrice", label: "Цена за оборудование" },
  { kind: "filter", key: "showConsumablePrice", label: "Цена за расходный материал" },
  { kind: "filter", key: "showServicePrice", label: "Цена за услуги" },
  { kind: "print", key: "showTaxSeparate", label: "Налог отдельно" },
];

/** Текущий экспорт: при безнале строки без налога, налог отдельной строкой. */
export function cashlessTaxSeparate(
  cashless: boolean,
  options: Pick<QuotePrintOptions, "showTaxSeparate">,
): boolean {
  return cashless && options.showTaxSeparate !== false;
}

export type PrintColumn = "num" | "name" | "qty" | "coef" | "price" | "discount" | "sum";

export function printColumns(options: QuotePrintOptions): PrintColumn[] {
  const cols: PrintColumn[] = ["num", "name", "qty"];
  if (options.showLineCoef) cols.push("coef");
  if (options.showLinePrice) cols.push("price");
  if (options.showLineDiscount) cols.push("discount");
  cols.push("sum");
  return cols;
}

export function printColumnTitle(col: PrintColumn, nameHeader: string): string {
  switch (col) {
    case "num":
      return "№";
    case "name":
      return nameHeader;
    case "qty":
      return "Кол-во";
    case "coef":
      return "Коэф";
    case "price":
      return "Цена";
    case "discount":
      return "Скидка";
    case "sum":
      return "Сумма";
  }
}

export type PrintHeaderMeta = {
  proposalNumber?: string;
  eventName?: string;
  date?: string;
  time?: string;
  place?: string;
  client?: string;
  clientPhone?: string;
  address?: string;
  formedAt?: string;
  comment?: string;
  /** Название компании в шапке, если включено «Фирма». */
  firm?: string;
};

export type PrintHeaderModel = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

function filled(value?: string): string {
  const text = value?.trim();
  return text || "—";
}

export function buildPrintHeader(
  meta: PrintHeaderMeta,
  options: QuotePrintOptions,
): PrintHeaderModel {
  const rows: Array<{ label: string; value: string }> = [];
  const push = (on: boolean, label: string, value?: string) => {
    if (!on) return;
    rows.push({ label, value: filled(value) });
  };
  push(options.showFormedAt, "Дата формирования", meta.formedAt || todayLabel());
  push(options.showProjectNumber, "Номер проекта", meta.proposalNumber);
  push(options.showFirm, "Фирма", meta.firm);
  push(options.showEventDate, "Дата проведения", meta.date);
  push(options.showEventTime, "Время проведения", meta.time);
  push(options.showClient, "Клиент", meta.client);
  push(options.showClientPhone, "Телефон клиента", meta.clientPhone);
  push(options.showVenue, "Площадка", meta.place);
  push(options.showAddress, "Адрес", meta.address);
  push(options.showComment, "Комментарий", meta.comment);
  const title =
    options.showProjectName && meta.eventName?.trim()
      ? meta.eventName.trim()
      : "Коммерческое предложение";
  return { title, rows };
}
