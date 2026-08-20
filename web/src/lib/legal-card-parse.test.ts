import assert from "node:assert/strict";
import {
  cardPreviewToClientPatch,
  parseEnterpriseCard,
} from "./legal-card-parse";

const card = parseEnterpriseCard(`Карточка предприятия
Наименование организации
ИП Иванов Иван Иванович
Полное наименование организации
Индивидуальный предприниматель Иванов Иван Иванович
Юридический адрес
г. Тестовск, ул. Примерная, д. 1, кв. 2
Фактический адрес
г. Тестовск, ул. Примерная, д. 1, кв. 2
e-mail: test@example.com
Tel:
+7-900-000-00-00
ИНН
123456789012
ОГРНИП
123456789012345
Банковские реквизиты
Банк
ПАО СБЕРБАНК
Р/счет
40802810100000000001
Кор/счет
30101810400000000225
БИК
044525225
`);
assert.equal(card.preview.inn, "123456789012");
assert.equal(card.preview.ogrnip, "123456789012345");
assert.match(card.preview.companyName, /Иванов/);
assert.match(card.preview.legalAddress, /Примерная/);
assert.equal(card.preview.email.toLowerCase(), "test@example.com");
assert.match(card.preview.phone, /900/);
assert.equal(card.preview.banks.length, 1);
assert.equal(card.preview.banks[0].account, "40802810100000000001");
assert.equal(card.preview.banks[0].bik, "044525225");
assert.equal(card.preview.banks[0].corrAccount, "30101810400000000225");
assert.match(card.preview.banks[0].bankName, /СБЕР/i);
assert.equal(card.warnings.length, 0);

const tink = parseEnterpriseCard(`ИП Иванов Иван Иванович
ИНН: 123456789012
Банк АО «ТБанк»
Р/сч 40802810900000000002
БИК 044525974
К/сч 30101810145250000974`);
assert.equal(tink.preview.inn, "123456789012");
assert.equal(tink.preview.banks[0]?.account, "40802810900000000002");
assert.equal(tink.preview.banks[0]?.bik, "044525974");
assert.match(tink.preview.banks[0]?.bankName || "", /ТБанк|Т-Банк|Т банк/i);

const gpb = parseEnterpriseCard(`Расчетный счет и все реквизиты в соответствии с банковским уведомлением
Р/сч 40702810100000239691
Банк ГПБ (АО)
БИК 044525823
К/сч 30101810200000000823
Коды статистические`);
assert.equal(gpb.preview.banks[0]?.account, "40702810100000239691");
assert.equal(gpb.preview.banks[0]?.bik, "044525823");
assert.equal(gpb.preview.banks[0]?.corrAccount, "30101810200000000823");
assert.match(gpb.preview.banks[0]?.bankName || "", /ГПБ/i);
assert.equal(gpb.preview.companyName, "");
const gpbPatch = cardPreviewToClientPatch(gpb.preview);
assert.equal(gpbPatch.companyName, undefined);
assert.match(gpbPatch.legalDetails || "", /40702810100000239691/);

console.log("legal-card-parse.test.ts: ok");
