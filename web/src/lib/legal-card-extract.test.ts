import assert from "node:assert/strict";
import { extractCardText } from "./legal-card-extract";
import { parseEnterpriseCard } from "./legal-card-parse";

const rtf = Buffer.from(
  `{\\rtf1\\ansi\\ansicpg1251\\deff0
ИНН 123456789012\\par
ОГРНИП 123456789012345\\par
ИП Иванов Иван Иванович\\par
Банк ПАО СБЕРБАНК\\par
Р/счет 40802810100000000001\\par
БИК 044525225\\par
}`,
  "utf8",
);
const fromRtf = parseEnterpriseCard(extractCardText(rtf, "card.rtf"));
assert.equal(fromRtf.preview.inn, "123456789012");
assert.equal(fromRtf.preview.banks[0]?.account, "40802810100000000001");
assert.match(fromRtf.preview.companyName, /Иванов/);

const txt = Buffer.from(
  "ИНН 123456789012\nИП Иванов Иван Иванович\nР/счет 40802810100000000001\nБИК 044525225\n",
  "utf8",
);
const fromTxt = parseEnterpriseCard(extractCardText(txt, "card.txt"));
assert.equal(fromTxt.preview.inn, "123456789012");

console.log("legal-card-extract.test.ts: ok");
