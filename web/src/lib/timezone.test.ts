import assert from "node:assert/strict";
import { greetingByHour } from "./timezone";

assert.equal(greetingByHour(7), "Доброе утро");
assert.equal(greetingByHour(13), "Добрый день");
assert.equal(greetingByHour(19), "Добрый вечер");
assert.equal(greetingByHour(2), "Доброй ночи");
