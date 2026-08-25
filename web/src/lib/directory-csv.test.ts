import assert from "node:assert/strict";
import { toCsv } from "./catalog-csv";
import { uniqueCopyName } from "./csv";
import {
  parseClientCsv,
  parseLegalAccountsCsv,
  parseLegalCsv,
  parseRateCsv,
  parseUserCsv,
  parseVenueCsv,
  parseVehicleCsv,
  parseKitCsv,
  parseQuoteCsv,
  formatLegalAccountsCsv,
  clientToCsvCells,
  venueToCsvCells,
  rateToCsvCells,
  vehicleToCsvCells,
  kitToCsvCells,
  quoteToCsvCells,
} from "./directory-csv";

assert.equal(uniqueCopyName("ИП Иванов", ["ип иванов"]), "ИП Иванов (копия)");
assert.equal(
  uniqueCopyName("ИП Иванов", ["ип иванов", "ип иванов (копия)"]),
  "ИП Иванов (копия 2)",
);

const clientCsv = toCsv([
  ["ID", "Компания", "Контакт", "Телефон", "Email", "ИНН", "Юр.адрес", "Реквизиты", "Комментарий", "Активен"],
  ["c1", "АО Тест", "Иван", "+7", "a@b.c", "123", "адрес", "реки", "комм", "1"],
]);
const clients = parseClientCsv(clientCsv);
assert.equal(clients.errors.length, 0);
assert.equal(clients.rows.length, 1);
assert.equal(clients.rows[0].companyName, "АО Тест");
assert.equal(clients.rows[0].id, "c1");
assert.deepEqual(
  clientToCsvCells({ ...clients.rows[0], id: "c1" }).slice(0, 3),
  ["c1", "АО Тест", "Иван"],
);

const venueCsv = toCsv([
  ["Название", "Адрес", "Карта", "Комментарий", "Активен"],
  ["Крокус", "МКАД", "https://maps", "", "0"],
]);
const venues = parseVenueCsv(venueCsv);
assert.equal(venues.rows[0].name, "Крокус");
assert.equal(venues.rows[0].active, false);
assert.equal(venueToCsvCells({ ...venues.rows[0], id: "v1" })[1], "Крокус");

const accounts = parseLegalAccountsCsv(
  "Сбер|Сбербанк|40802810100000000001|30101810900000000607|042520607|1",
);
assert.equal(accounts.length, 1);
assert.equal(accounts[0].account, "40802810100000000001");
assert.equal(accounts[0].isDefault, true);
const round = parseLegalAccountsCsv(formatLegalAccountsCsv(accounts));
assert.equal(round[0].bik, "042520607");

const legalCsv = toCsv([
  ["Краткое", "ИНН", "Склад", "Счета"],
  ["ИП Тест", "123456789012", "ШМ", "Сбер|Банк|40802810100000000001|||1"],
]);
const legal = parseLegalCsv(legalCsv);
assert.equal(legal.errors.length, 0);
assert.equal(legal.rows[0].catalogOwner, "SHOW_MASTER");
assert.equal(legal.rows[0].accounts[0].label, "Сбер");

const userCsv = toCsv([
  ["Email", "ФИО", "Роль", "Фирмы", "Специальности", "Активен"],
  ["user@test.ru", "Петров П.П.", "Бригадир", "ШМ;ДК", "Звук; Свет", "1"],
]);
const users = parseUserCsv(userCsv);
assert.equal(users.rows[0].role, "BRIGADIER");
assert.deepEqual(users.rows[0].owners, ["SHOW_MASTER", "DIAKOM"]);
assert.deepEqual(users.rows[0].specialties, ["Звук", "Свет"]);
assert.equal(users.rows[0].password, null);

const exportLike = parseUserCsv(toCsv([
  ["ID", "Email", "ФИО", "Фамилия", "Имя", "Отчество", "Телефон", "Роль", "Оклад", "Агентство %", "Фирмы", "Комментарий", "Активен", "Специальности", "Пароль"],
  ["", "new@local.test", "Иванов Иван", "Иванов", "Иван", "", "", "EMPLOYEE", "0", "5", "ШМ", "", "0", "Звукооператор", ""],
]));
assert.equal(exportLike.errors.length, 0);
assert.equal(exportLike.rows[0].email, "new@local.test");
assert.equal(exportLike.rows[0].password, null);
assert.deepEqual(exportLike.rows[0].specialties, ["Звукооператор"]);

const rateCsv = toCsv([
  ["Название", "Порядок", "Час", "Смена", "Описание", "Активен"],
  ["Звукооператор", "2", "1500", "8000", "Пульт и радио", "1"],
]);
const rates = parseRateCsv(rateCsv);
assert.equal(rates.rows[0].hourlyRate, 1500);
assert.equal(rates.rows[0].sortOrder, 2);
assert.equal(rates.rows[0].description, "Пульт и радио");
assert.equal(rateToCsvCells({ ...rates.rows[0], id: "r1" })[1], "Звукооператор");
assert.equal(rateToCsvCells({ ...rates.rows[0], id: "r1" })[5], "Пульт и радио");

const missing = parseClientCsv(toCsv([["Контакт"], ["Иван"]]));
assert.ok(missing.errors[0]?.includes("Компания"));

const vehicleCsv = toCsv([
  ["Номер", "Марка", "Модель", "Расход", "Пробег", "Активен"],
  ["А123АА777", "Газель", "Next", "12,5", "10000", "1"],
]);
const vehicles = parseVehicleCsv(vehicleCsv);
assert.equal(vehicles.errors.length, 0);
assert.equal(vehicles.rows[0].plateNumber, "А123АА777");
assert.equal(vehicles.rows[0].fuelConsumption, 12.5);
assert.equal(vehicleToCsvCells({ ...vehicles.rows[0], id: "v1" })[1], "А123АА777");

const kitCsv = toCsv([
  ["Название", "Состав"],
  ["Свет сцена", "2|item1|PAR;1|item2|Дым"],
]);
const kits = parseKitCsv(kitCsv);
assert.equal(kits.errors.length, 0);
assert.equal(kits.rows[0].name, "Свет сцена");
assert.equal(kits.rows[0].components.length, 2);
assert.equal(kits.rows[0].components[0].catalogItemId, "item1");
assert.equal(
  kitToCsvCells({
    id: "k1",
    name: kits.rows[0].name,
    description: null,
    sortOrder: 0,
    active: true,
    category: null,
    components: kits.rows[0].components.map((c) => ({
      qty: c.qty,
      catalogItemId: c.catalogItemId,
      catalogItem: { name: c.name },
    })),
  })[1],
  "Свет сцена",
);

const quoteCsv = toCsv([
  ["ID", "№", "Мероприятие", "Дата", "Клиент", "Оплачено"],
  ["q1", "42", "Свадьба", "2026-08-01", "ООО Ромашка", "1"],
]);
const quotes = parseQuoteCsv(quoteCsv);
assert.equal(quotes.errors.length, 0);
assert.equal(quotes.rows[0].eventName, "Свадьба");
assert.equal(quotes.rows[0].paid, true);
assert.equal(quoteToCsvCells({
  id: "q1",
  proposalNumber: "42",
  eventName: "Свадьба",
  date: "2026-08-01",
  durationDays: 1,
  client: "ООО Ромашка",
  place: "",
  lifecycle: "CALCULATED",
  owner: { name: "Иван" },
  managerName: "",
  invoiceSent: false,
  paid: true,
  paymentComment: "",
})[2], "Свадьба");
