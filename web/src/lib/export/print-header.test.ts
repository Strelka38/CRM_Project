import assert from "node:assert/strict";
import { formatLongRuDate } from "../dates";
import { buildPrintHeader, STANDARD_PRINT_OPTIONS } from "./print-options";

assert.equal(formatLongRuDate("2026-11-04"), "04 ноября 2026");
assert.equal(formatLongRuDate("21.10.26"), "21 октября 2026");
assert.equal(formatLongRuDate("12.08.2026"), "12 августа 2026");
assert.equal(formatLongRuDate(""), "");
assert.equal(formatLongRuDate("не дата"), "не дата");

const header = buildPrintHeader(
  {
    eventName: "День народного единства",
    formedAt: "21.10.26",
    date: "2026-11-04",
    mountDate: "03.11.2026",
    client: "Иркутский областной дом народного творчества",
    contactName: "Иванова Мария",
    contactPhone: "+7 900 000-00-00",
    clientPhone: "+7 900 000-00-00",
    place: "Иркутский национальный исследовательский технический университет",
  },
  {
    ...STANDARD_PRINT_OPTIONS,
    showFormedAt: true,
    showEventDate: true,
    showMountDate: true,
    showClient: true,
    showContact: true,
    showClientPhone: true,
    showVenue: true,
  },
);

assert.deepEqual(
  header.rows.map((row) => [row.label, row.value]),
  [
    ["Дата формирования", "21 октября 2026"],
    ["Дата мероприятия", "04 ноября 2026"],
    ["Дата монтажа", "03 ноября 2026"],
    ["Заказчик", "Иркутский областной дом народного творчества"],
    ["Контактное лицо", "Иванова Мария"],
    ["Телефон заказчика", "+7 900 000-00-00"],
    ["Место", "Иркутский национальный исследовательский технический университет"],
  ],
);

const phoneOnly = buildPrintHeader(
  { contactName: "", contactPhone: "+7 3952 00-00-00" },
  { ...STANDARD_PRINT_OPTIONS, showContact: true, showFormedAt: false },
);
assert.equal(phoneOnly.rows[0]?.label, "Контактное лицо");
assert.equal(phoneOnly.rows[0]?.value, "+7 3952 00-00-00");

console.log("print-header.test.ts: ok");
