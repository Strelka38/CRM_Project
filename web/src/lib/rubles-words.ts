/** Russian amount in words: «восемьдесят шесть тысяч девятьсот пятьдесят рублей 00 копеек». */

const ONES: string[] = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const ONES_FEM: string[] = [
  "",
  "одна",
  "две",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const TEENS: string[] = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS: string[] = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS: string[] = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

function triad(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (t === 1) {
    parts.push(TEENS[o]);
  } else {
    if (t) parts.push(TENS[t]);
    if (o) parts.push(feminine ? ONES_FEM[o] : ONES[o]);
  }
  return parts.join(" ");
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function group(
  n: number,
  feminine: boolean,
  one: string,
  few: string,
  many: string,
): string {
  if (!n) return "";
  const words = triad(n, feminine);
  return `${words} ${plural(n, one, few, many)}`;
}

/** Integer rubles + 00 kopecks. */
export function rublesInWords(amount: number): string {
  const rounded = Math.max(0, Math.round(amount));
  if (rounded === 0) return "ноль рублей 00 копеек";

  const billions = Math.floor(rounded / 1_000_000_000);
  const millions = Math.floor((rounded % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((rounded % 1_000_000) / 1000);
  const rest = rounded % 1000;

  const parts: string[] = [];
  const b = group(billions, false, "миллиард", "миллиарда", "миллиардов");
  const m = group(millions, false, "миллион", "миллиона", "миллионов");
  const t = group(thousands, true, "тысяча", "тысячи", "тысяч");
  if (b) parts.push(b);
  if (m) parts.push(m);
  if (t) parts.push(t);
  if (rest) parts.push(triad(rest, false));

  const rub = plural(rounded, "рубль", "рубля", "рублей");
  return `${parts.join(" ")} ${rub} 00 копеек`;
}

export function rublesInWordsCapitalized(amount: number): string {
  const s = rublesInWords(amount);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
