import assert from "node:assert/strict";
import { STANDARD_PRINT_OPTIONS } from "./print-options";
import {
  parseExportTemplateSettings,
  parseExportTemplates,
  templateNameError,
} from "./export-templates";

const parsed = parseExportTemplates(
  JSON.stringify([
    {
      id: "a",
      name: "  Для клиента  ",
      settings: {
        includeSummary: true,
        allTabsOneSheet: false,
        showEquipmentPrice: false,
        showConsumablePrice: true,
        showServicePrice: false,
        print: { showClient: true, showLinePrice: false },
        zoneIds: ["should-drop"],
      },
    },
    { id: "", name: "пусто" },
    { name: "без id" },
  ]),
);

assert.equal(parsed.length, 1);
assert.equal(parsed[0]?.name, "Для клиента");
assert.equal(parsed[0]?.settings.includeSummary, true);
assert.equal(parsed[0]?.settings.allTabsOneSheet, false);
assert.equal(parsed[0]?.settings.showEquipmentPrice, false);
assert.equal(parsed[0]?.settings.showServicePrice, false);
assert.equal(parsed[0]?.settings.print.showClient, true);
assert.equal(parsed[0]?.settings.print.showLinePrice, false);
assert.equal(parsed[0]?.settings.print.showFormedAt, STANDARD_PRINT_OPTIONS.showFormedAt);
assert.equal(parsed[0]?.settings.print.showTaxSeparate, true);
assert.equal("zoneIds" in parsed[0]!.settings, false);

assert.equal(parseExportTemplates("not-json").length, 0);
assert.equal(parseExportTemplates({}).length, 0);

const defaults = parseExportTemplateSettings(null);
assert.equal(defaults.includeSummary, false);
assert.equal(defaults.allTabsOneSheet, true);
assert.deepEqual(defaults.print, STANDARD_PRINT_OPTIONS);

assert.equal(templateNameError("  ", []), "Укажите название");
assert.equal(templateNameError("Стандартный шаблон", []), "Это название занято");
assert.equal(templateNameError("создать новый", []), "Это название занято");
assert.equal(
  templateNameError("Для клиента", [{ name: "для клиента" }]),
  "Такой шаблон уже есть",
);
assert.equal(templateNameError("Свой", [{ name: "Другой" }]), null);

console.log("export-templates.test.ts ok");
