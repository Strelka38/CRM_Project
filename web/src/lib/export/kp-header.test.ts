import assert from "node:assert/strict";
import {
  BRAND_NAME,
  BRAND_SITE,
  buildKpHeader,
  formatManagerContact,
} from "./kp-header";

assert.equal(
  formatManagerContact("Иванов Иван", "+7 3952 00-00-00"),
  "Иванов Иван, +7 3952 00-00-00",
);
assert.equal(formatManagerContact("Иванов Иван", ""), "Иванов Иван");
assert.equal(formatManagerContact("", "+7"), "+7");
assert.equal(formatManagerContact("", ""), "—");

const header = buildKpHeader({
  proposalNumber: "101",
  eventName: "СибЭкспо-Вектор",
  date: "12.08.2026",
  place: "МВЦ",
  client: "ООО Вектор",
  requestContact: "@client · +7 900",
  managerName: "Стрельченко Артем",
  managerPhone: "+7 900 000-00-00",
});

assert.equal(header.title, "СибЭкспо-Вектор");
assert.deepEqual(
  header.rows.map((r) => r.label),
  [
    "КП №",
    "Дата проведения",
    "Заказчик",
    "Контакт от заказчика",
    "Менеджер",
    "Место",
  ],
);
assert.equal(header.rows[0].value, "101");
assert.equal(header.rows[2].value, "ООО Вектор");
assert.equal(header.rows[3].value, "@client · +7 900");
assert.equal(header.rows[4].value, "Стрельченко Артем, +7 900 000-00-00");
assert.equal(header.rows[5].value, "МВЦ");
assert.equal(
  header.rows.some((r) => /монтаж|демонтаж/i.test(r.label)),
  false,
);

const empty = buildKpHeader({});
assert.equal(empty.title, "Коммерческое предложение");
assert.equal(empty.rows[3].value, "—");
assert.equal(empty.rows[4].value, "—");
assert.equal(BRAND_NAME, "Байкал Стейдж Групп");
assert.equal(BRAND_SITE, "baikalstagegroup.ru");

console.log("kp-header.test.ts: ok");
