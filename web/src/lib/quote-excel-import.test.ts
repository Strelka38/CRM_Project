import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { cashlessUnitPrice } from "./pricing";
import {
  applyCatalogMatches,
  eventNameFromFilename,
  guessCashFromCashless,
  matchCatalogItem,
  normalizeItemName,
  parseArtemWorkbook,
  parseExcelDateRange,
} from "./quote-excel-import";

async function parseBuilt(
  build: (wb: ExcelJS.Workbook) => void,
  fileName?: string,
) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return parseArtemWorkbook(buf, { fileName });
}

function compactHeader(ws: ExcelJS.Worksheet) {
  ws.getCell("A3").value = "Сумма";
  ws.getCell("B3").value = 33920;
  ws.getCell("A4").value = "Мероприятие:";
  ws.getCell("B4").value = "Супермен";
  ws.getCell("A5").value = "Дата:";
  ws.getCell("B5").value = "14.08.2026";
  ws.getCell("A6").value = "Время:";
  ws.getCell("B6").value = "10:00";
  ws.getCell("A7").value = "Место:";
  ws.getCell("B7").value = "Мариотт";
  ws.getCell("A8").value = "Заказчик, контактная информация:";
  ws.getCell("B8").value = "Иванов";
  ws.getCell("A9").value = "Менеджер площадки:";
  ws.getCell("B9").value = "Стрельченко Артем";
  ws.getCell("A10").value = "Безналичный расчет (1)";
  ws.getCell("B10").value = 1;
  ws.getCell("A11").value = "Продолжительность:";
  ws.getCell("B11").value = "1 день";
  ws.getCell("A12").value = "№";
  ws.getCell("B12").value = "Оборудование";
  ws.getCell("C12").value = "Кол-во";
  ws.getCell("D12").value = "Цена, шт.";
  ws.getCell("E12").value = "День коэф";
  ws.getCell("F12").value = "Сумма, р.";
}

function templateHeader(ws: ExcelJS.Worksheet) {
  ws.getCell("B3").value = "Сумма";
  ws.getCell("E3").value = 18910;
  ws.getCell("B4").value = "Мероприятие:";
  ws.getCell("C4").value = "Конференция";
  ws.getCell("B5").value = "Дата: 9-10 сентября 2025";
  ws.getCell("B6").value = "Время:";
  ws.getCell("B7").value = "Место: ПО Бурдугуз";
  ws.getCell("B8").value = "Заказчик, контактная информация: Елена";
  ws.getCell("B9").value = "Менеджер площадки: Снигерев Андрей";
  ws.getCell("B10").value = "Безналичный расчет (1)";
  ws.getCell("C10").value = 1;
  ws.getCell("B11").value = "Продолжительность:";
  ws.getCell("C11").value = 1;
  ws.getCell("A12").value = "№";
  ws.getCell("B12").value = "Оборудование";
  ws.getCell("C12").value = "Кол-во";
  ws.getCell("D12").value = "Цена, шт.";
  ws.getCell("E12").value = "Цена, шт.";
  ws.getCell("F12").value = "День коэф";
  ws.getCell("G12").value = "Сумма, р.";
  ws.getCell("H12").value = "Сумма, р.";
}

async function main() {
{
  const d = parseExcelDateRange("9-10 сентября 2025");
  assert.equal(d?.date, "09.09.2025");
  assert.equal(d?.durationDays, 2);
  assert.equal(parseExcelDateRange("14.08.2026")?.date, "14.08.2026");
  assert.equal(parseExcelDateRange("9 сентября 2025")?.date, "09.09.2025");
  const range = parseExcelDateRange("04.09.2026 - 06.09.2026");
  assert.equal(range?.date, "04.09.2026");
  assert.equal(range?.durationDays, 3);
}

{
  assert.equal(guessCashFromCashless(3340), 3000);
  assert.equal(guessCashFromCashless(11120), 10000);
  assert.equal(guessCashFromCashless(3890), 3500);
  assert.equal(guessCashFromCashless(4450), 4000);
  assert.equal(guessCashFromCashless(7780), 7000);
  assert.equal(cashlessUnitPrice(guessCashFromCashless(1670), true, null), 1670);
}

{
  assert.equal(normalizeItemName("  KS Audio  «T10» "), "ks audio t10");
  const catalog = [
    { id: "a", name: "KS Audio TRIAKS T10-L - акустическая система" },
    { id: "b", name: "Ноутбук (контент)" },
  ];
  assert.equal(matchCatalogItem("Ноутбук (контент)", catalog), "b");
  assert.equal(
    matchCatalogItem(
      "KS Audio TRIAKS T10-L - акустическая система, 1600 Вт",
      catalog,
    ),
    "a",
  );
  assert.equal(matchCatalogItem("Совсем другая позиция", catalog), null);
}

assert.equal(
  eventNameFromFilename("2026_08_14 Мариотт_супермен.xlsx"),
  "Мариотт супермен",
);
assert.equal(
  eventNameFromFilename("Вечный_огонь_04-09-2026.xlsx"),
  "Вечный огонь",
);
assert.equal(
  eventNameFromFilename("Форум Байкал 2026.._09-08-2026.xlsx"),
  "Форум Байкал 2026",
);

{
  const parsed = await parseBuilt((wb) => {
    const ws = wb.addWorksheet("КП");
    compactHeader(ws);
    ws.getCell("A13").value = "Звуковое оборудование";
    ws.getCell("B13").value = "Звуковое оборудование";
    ws.getCell("A14").value = 1;
    ws.getCell("B14").value = "Ноутбук (контент)";
    ws.getCell("C14").value = 1;
    ws.getCell("D14").value = 3340;
    ws.getCell("E14").value = 1;
    ws.getCell("F14").value = 3340;
    ws.getCell("A15").value = 2;
    ws.getCell("B15").value = "Услуги технического персонала";
    ws.getCell("C15").value = 1;
    ws.getCell("D15").value = 11120;
    ws.getCell("E15").value = 1;
    ws.getCell("A16").value = "Итого звук:";
    ws.getCell("F16").value = 14460;
    ws.getCell("A17").value = "Видео оборудование";
    ws.getCell("B17").value = "Видео оборудование";
    ws.getCell("A18").value = 1;
    ws.getCell("B18").value = "Панель суфлер";
    ws.getCell("C18").value = 1;
    ws.getCell("D18").value = 7780;
    ws.getCell("E18").value = 1;
    ws.getCell("A19").value = "ИТОГО";
    ws.getCell("F19").value = 22240;
    ws.getCell("B20").value = "Итого сцена 16х10 м:";
    ws.getCell("C20").value = 1610;
    ws.getCell("D20").value = 1610;
    ws.getCell("E20").value = 1610;
  });
  assert.equal(parsed.meta.eventName, "Супермен");
  assert.equal(parsed.meta.date, "14.08.2026");
  assert.equal(parsed.meta.place, "Мариотт");
  assert.equal(parsed.meta.client, "Иванов");
  assert.equal(parsed.meta.cashless, true);
  assert.equal(parsed.itemCount, 3);
  const items = parsed.structure.blocks.filter((b) => b.type === "ITEM");
  assert.equal(items.length, 3);
  assert.equal(items[0]?.name, "Ноутбук (контент)");
  assert.equal(items[0]?.unitPrice, 3000);
  assert.equal(items[0]?.dayCoefOverride, 1);
  assert.equal(parsed.structure.zones.length, 1);
  assert.equal(parsed.structure.zones[0]?.name, "Зона 1");
  assert.ok(items.every((b) => b.zoneIndex === 0));
  assert.ok(
    parsed.structure.blocks.some(
      (b) => b.type === "SECTION" && b.title === "Видео оборудование",
    ),
  );
}

{
  const parsed = await parseBuilt((wb) => {
    const ws = wb.addWorksheet("Лист1");
    templateHeader(ws);
    ws.getCell("A13").value = "Звуковое оборудование";
    ws.getCell("A14").value = 1;
    ws.getCell("B14").value = "KS Audio TRIAKS T10-L - акустическая система";
    ws.getCell("D14").value = 3500;
    ws.getCell("E14").value = 3890;
    ws.getCell("F14").value = 1;
    ws.getCell("A15").value = 2;
    ws.getCell("B15").value = "SHURE SLXD24";
    ws.getCell("C15").value = 4;
    ws.getCell("D15").value = 3000;
    ws.getCell("E15").value = 3340;
    ws.getCell("F15").value = 1;
    ws.getCell("A16").value = 3;
    ws.getCell("B16").value = "Доставка особая";
    ws.getCell("C16").value = 1;
    ws.getCell("D16").value = 1500;
    ws.getCell("E16").value = 2000;
    ws.getCell("F16").value = 1;
    ws.getCell("B17").value = "Итого звук:";
    ws.getCell("G17").value = 13500;
    ws.getCell("A18").value = "Разное";
    ws.getCell("A19").value = 1;
    ws.getCell("B19").value = "Транспортные расходы";
    ws.getCell("C19").value = 1;
    ws.getCell("D19").value = 4000;
    ws.getCell("E19").value = 4450;
    ws.getCell("F19").value = 1;
  });
  assert.equal(parsed.meta.eventName, "Конференция");
  assert.equal(parsed.meta.date, "09.09.2025");
  assert.equal(parsed.meta.durationDays, 2);
  assert.equal(parsed.meta.place, "ПО Бурдугуз");
  assert.equal(parsed.itemCount, 3);
  const items = parsed.structure.blocks.filter((b) => b.type === "ITEM");
  assert.equal(items.length, 3);
  assert.equal(items[0]?.name, "SHURE SLXD24");
  assert.equal(items[0]?.qty, 4);
  assert.equal(items[0]?.unitPrice, 3000);
  assert.equal(items[0]?.cashlessOverride, null);
  assert.equal(items[1]?.name, "Доставка особая");
  assert.equal(items[1]?.unitPrice, 1500);
  assert.equal(items[1]?.cashlessOverride, 2000);
  assert.equal(parsed.structure.zones.length, 1);
  assert.ok(items.every((b) => b.zoneIndex === 0));
}

{
  const parsed = await parseBuilt((wb) => {
    for (const name of ["Большой зал", "Южный", "Смены", "Настройки"]) {
      const ws = wb.addWorksheet(name);
      if (name === "Смены" || name === "Настройки") {
        ws.getCell("A1").value = "Сотрудник";
        continue;
      }
      templateHeader(ws);
      ws.getCell("C4").value = "Конференция";
      ws.getCell("A13").value = "Звуковое оборудование";
      ws.getCell("B14").value = `Микшер ${name}`;
      ws.getCell("C14").value = name === "Южный" ? 2 : 1;
      ws.getCell("D14").value = 5000;
      ws.getCell("E14").value = 5560;
      ws.getCell("F14").value = 1;
    }
    const old = wb.addWorksheet("КП (7)");
    templateHeader(old);
    old.getCell("C4").value = "Конференция СПИД центра 2023";
    old.getCell("B5").value = "Дата: 24-25 августа 2023";
    old.getCell("B14").value = "Старый микшер";
    old.getCell("C14").value = 1;
    old.getCell("D14").value = 5000;
    old.getCell("E14").value = 5560;
    old.getCell("F14").value = 1;
  });
  assert.equal(parsed.itemCount, 2);
  assert.equal(parsed.structure.zones.length, 2);
  assert.deepEqual(
    parsed.structure.zones.map((z) => z.name),
    ["Большой зал", "Южный"],
  );
  const items = parsed.structure.blocks.filter((b) => b.type === "ITEM");
  assert.equal(items[0]?.zoneIndex, 0);
  assert.equal(items[1]?.zoneIndex, 1);
  assert.equal(items[1]?.qty, 2);
  assert.ok(parsed.warnings.some((w) => /КП \(7\)/.test(w)));
}

{
  const parsed = await parseBuilt((wb) => {
    const ws = wb.addWorksheet("КП");
    compactHeader(ws);
    ws.getCell("B14").value = "Пустышка";
    ws.getCell("C14").value = 0;
    ws.getCell("D14").value = 1000;
  });
  assert.equal(parsed.itemCount, 0);
}

{
  const { unmatched, structure } = applyCatalogMatches(
    {
      zones: [{ name: "Звук", sortOrder: 0 }],
      blocks: [
        { type: "ITEM", sortOrder: 0, name: "Ноутбук (контент)", zoneIndex: 0 },
        { type: "ITEM", sortOrder: 1, name: "Нет в базе", zoneIndex: 0 },
      ],
    },
    [{ id: "nb", name: "Ноутбук (контент)" }],
  );
  assert.equal(structure.blocks[0]?.catalogItemId, "nb");
  assert.equal(structure.blocks[1]?.catalogItemId, null);
  assert.deepEqual(unmatched, ["Нет в базе"]);
}

{
  const parsed = await parseBuilt(
    (wb) => {
      const ws = wb.addWorksheet("Лист1");
      compactHeader(ws);
      ws.getCell("B4").value = "";
      ws.getCell("B14").value = "Кабель";
      ws.getCell("C14").value = 2;
      ws.getCell("D14").value = 500;
      ws.getCell("E14").value = 1;
    },
    "2026_08_14 Мариотт_супермен.xlsx",
  );
  assert.equal(parsed.meta.eventName, "Мариотт супермен");
}

{
  const parsed = await parseBuilt((wb) => {
    const info = wb.addWorksheet("Общая информация");
    info.getCell("A1").value = "Проект:";
    info.getCell("C1").value = "Вечный_огонь";
    info.getCell("A2").value = "Дата/Время:";
    info.getCell("C2").value = "04.09.2026 - 06.09.2026";
    info.getCell("A6").value = "№";
    info.getCell("B6").value = "Коммерческое предложение";
    info.getCell("C6").value = "Оборудование";
    info.getCell("F6").value = "Итого";

    const ws = wb.addWorksheet("Все вкладки на одном листе");
    ws.getCell("A1").value = "Смета 1";
    ws.getCell("A2").value = "Звук";
    ws.getCell("A3").value = "№";
    ws.getCell("B3").value = "Оборудование";
    ws.getCell("D3").value = "Комментарий";
    ws.getCell("F3").value = "Кол-во";
    ws.getCell("G3").value = "Цена";
    ws.getCell("H3").value = "Сумма";
    ws.getCell("A4").value = 1;
    ws.getCell("B4").value = "RCF HDL10A";
    ws.getCell("F4").value = 12;
    ws.getCell("G4").value = 3000;
    ws.getCell("A5").value = "Итого Звук:";
    ws.getCell("H5").value = 36000;
    ws.getCell("A6").value = "Сценический комплекс/подиум/фермы";
    ws.getCell("A7").value = "№";
    ws.getCell("B7").value = "Оборудование";
    ws.getCell("D7").value = "Комментарий";
    ws.getCell("F7").value = "Кол-во";
    ws.getCell("G7").value = "Цена";
    ws.getCell("A8").value = 1;
    ws.getCell("B8").value = "Подиум типа евростол";
    ws.getCell("D8").value = "Подиум 12х7 м";
    ws.getCell("F8").value = 30;
    ws.getCell("G8").value = 2000;
    ws.getCell("A9").value = "Итог - Аренда:";
    ws.getCell("A10").value = "Услуги";
    ws.getCell("A11").value = "№";
    ws.getCell("B11").value = "Услуги";
    ws.getCell("D11").value = "Состав работ/услуг";
    ws.getCell("F11").value = "Кол-во";
    ws.getCell("G11").value = "Цена";
    ws.getCell("A12").value = 1;
    ws.getCell("B12").value = "Звукооператор";
    ws.getCell("F12").value = 1;
    ws.getCell("G12").value = 15000;
    ws.getCell("A13").value = "Налоги, банк 10.00%:";
    ws.getCell("H13").value = 52277.78;
    ws.getCell("A14").value = "К оплате:";
    ws.getCell("H14").value = 522777.78;
  }, "Вечный_огонь_04-09-2026.xlsx");

  assert.equal(parsed.meta.eventName, "Вечный огонь");
  assert.equal(parsed.meta.date, "04.09.2026");
  assert.equal(parsed.meta.durationDays, 3);
  assert.equal(parsed.meta.cashless, true);
  assert.equal(parsed.itemCount, 3);
  const items = parsed.structure.blocks.filter((b) => b.type === "ITEM");
  assert.equal(items.length, 3);
  assert.equal(items[0]?.name, "RCF HDL10A");
  assert.equal(items[0]?.qty, 12);
  assert.equal(items[0]?.unitPrice, 3000);
  assert.equal(items[0]?.dayCoefOverride, 1);
  assert.equal(parsed.structure.zones.length, 1);
  assert.equal(parsed.structure.zones[0]?.name, "Зона 1");
  assert.ok(items.every((b) => b.zoneIndex === 0));
  assert.equal(items[1]?.name, "Подиум типа евростол (Подиум 12х7 м)");
  assert.equal(items[1]?.unitPrice, 2000);
  assert.equal(items[2]?.name, "Звукооператор");
  assert.equal(items[2]?.unitPrice, 15000);
  assert.ok(
    parsed.structure.blocks.some(
      (b) => b.type === "SECTION" && b.title === "Услуги",
    ),
  );
}

{
  const parsed = await parseBuilt((wb) => {
    wb.addWorksheet("Общая информация");
    for (const [sheetName, section, itemName, qty, price] of [
      ["1. Звук 1", "Звук", "KS AUDIO T10-L", 4, 8750],
      ["2. Свет 1", "Свет", "ASM Lighting BSW-470B", 6, 6250],
      ["3. Сцена 1", "Сценический комплекс/подиум/фермы", "Сценический комплекс", 1, 375000],
      ["4. Разное 1", "Электрооборудование", "Кабель СИП", 1, 25000],
    ] as const) {
      const ws = wb.addWorksheet(sheetName);
      ws.getCell("A1").value = sheetName.replace(/^\d+\.\s*/, "");
      ws.getCell("A2").value = section;
      ws.getCell("A3").value = "№";
      ws.getCell("B3").value = "Оборудование";
      ws.getCell("D3").value = "Комментарий";
      ws.getCell("F3").value = "Кол-во";
      ws.getCell("G3").value = "Цена";
      ws.getCell("H3").value = "Сумма";
      ws.getCell("A4").value = 1;
      ws.getCell("B4").value = itemName;
      ws.getCell("F4").value = qty;
      ws.getCell("G4").value = price;
      ws.getCell("A5").value = "Итог - Аренда:";
      ws.getCell("A6").value = "Налоги, банк 10.00%:";
      ws.getCell("A7").value = "К оплате:";
    }
  }, "Форум Байкал 2026.._09-08-2026.xlsx");

  assert.equal(parsed.meta.eventName, "Форум Байкал 2026");
  assert.equal(parsed.meta.date, "09.08.2026");
  assert.equal(parsed.itemCount, 4);
  assert.deepEqual(
    parsed.structure.zones.map((z) => z.name),
    ["Звук", "Свет", "Сцена", "Разное"],
  );
  const items = parsed.structure.blocks.filter((b) => b.type === "ITEM");
  assert.equal(items[0]?.unitPrice, 8750);
  assert.equal(items[0]?.dayCoefOverride, 1);
  assert.equal(items[1]?.name, "ASM Lighting BSW-470B");
  assert.equal(items[2]?.zoneIndex, 2);
  assert.equal(items[3]?.unitPrice, 25000);
}

console.log("quote-excel-import.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
