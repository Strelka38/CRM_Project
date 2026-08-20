import assert from "node:assert/strict";
import { rublesInWords, rublesInWordsCapitalized } from "./rubles-words";

assert.equal(rublesInWords(0), "ноль рублей 00 копеек");
assert.equal(rublesInWords(1), "один рубль 00 копеек");
assert.equal(rublesInWords(2), "два рубля 00 копеек");
assert.equal(rublesInWords(5), "пять рублей 00 копеек");
assert.equal(
  rublesInWords(86950),
  "восемьдесят шесть тысяч девятьсот пятьдесят рублей 00 копеек",
);
assert.equal(
  rublesInWords(90090),
  "девяносто тысяч девяносто рублей 00 копеек",
);
assert.equal(
  rublesInWordsCapitalized(1200),
  "Одна тысяча двести рублей 00 копеек",
);

console.log("rubles-words.test.ts: ok");
