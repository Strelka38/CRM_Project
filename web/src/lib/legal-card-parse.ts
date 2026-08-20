export type LegalCardBank = {
  label: string;
  bankName: string;
  account: string;
  corrAccount: string;
  bik: string;
};

export type LegalCardPreview = {
  companyName: string;
  fullName: string;
  inn: string;
  ogrnip: string;
  legalAddress: string;
  actualAddress: string;
  phone: string;
  email: string;
  banks: LegalCardBank[];
  edoOperator: string;
};

export type LegalCardParseResult = {
  preview: LegalCardPreview;
  warnings: string[];
};

const EMPTY: LegalCardPreview = {
  companyName: "",
  fullName: "",
  inn: "",
  ogrnip: "",
  legalAddress: "",
  actualAddress: "",
  phone: "",
  email: "",
  banks: [],
  edoOperator: "",
};

const LABEL_NEXT: Record<string, keyof LegalCardPreview | "bank" | "account" | "corr" | "bik"> = {
  "наименование организации": "companyName",
  "полное наименование организации": "fullName",
  "юридический адрес": "legalAddress",
  "фактический адрес": "actualAddress",
  "инн": "inn",
  "огрнип": "ogrnip",
  "огрн": "ogrnip",
  "банк": "bank",
  "р/счет": "account",
  "р/счёт": "account",
  "р/сч": "account",
  "р/с": "account",
  "расчётный счёт": "account",
  "расчетный счет": "account",
  "счет": "account",
  "счёт": "account",
  "кор/счет": "corr",
  "кор/счёт": "corr",
  "корр. счёт": "corr",
  "корр. счет": "corr",
  "корр счет": "corr",
  "к/сч": "corr",
  "к/с": "corr",
  "бик": "bik",
};

function stripJunk(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/HYPERLINK\s+"mailto:[^"]+"\s*/gi, "")
    .replace(/HYPERLINK\s+"[^"]+"\s*/gi, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function looksLikeInn(d: string): boolean {
  return d.length === 10 || d.length === 12;
}

function looksLikeOgrnip(d: string): boolean {
  return d.length === 13 || d.length === 15;
}

function looksLikeAccount(d: string): boolean {
  return d.length === 20;
}

function looksLikeBik(d: string): boolean {
  return d.length === 9;
}

function normalizeLabel(line: string): string {
  return line
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function firstEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function firstPhone(text: string): string {
  const m = text.match(/\+7[\s\-()]*(?:\d[\s\-()]*){9,11}/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

function isAddressLine(line: string): boolean {
  if (/^\d{6}\b/.test(line)) return true;
  if (/^(г\.|город|д\.|дер\.|иркутск)/i.test(line)) return true;
  if (/ул\.|пер\.|просп\.|мкр|кв\.|д\.\s*\d/i.test(line) && line.length > 12) {
    return true;
  }
  return false;
}

function isNameLine(line: string): boolean {
  return /^(ип\s+|индивидуальный предприниматель\s+)/i.test(line.trim());
}

function expandShortName(name: string): string {
  const t = name.trim();
  if (/^индивидуальный предприниматель\s+/i.test(t)) return t;
  if (/^ип\s+/i.test(t)) {
    return t.replace(/^ип\s+/i, "Индивидуальный предприниматель ");
  }
  return t;
}

function shortenName(name: string): string {
  const t = name
    .replace(/^индивидуальный предприниматель\s+/i, "ИП ")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

function sameLineValue(line: string): { label: string; value: string } | null {
  const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
  if (!m) return null;
  return { label: normalizeLabel(m[1]), value: m[2].trim() };
}

type BankDraft = {
  label: string;
  bankName: string;
  account: string;
  corrAccount: string;
  bik: string;
};

function flushBank(banks: LegalCardBank[], draft: BankDraft) {
  if (!draft.account && !draft.bankName && !draft.bik) return;
  banks.push({
    label: draft.label,
    bankName: draft.bankName.trim(),
    account: draft.account,
    corrAccount: draft.corrAccount,
    bik: draft.bik,
  });
  draft.label = "";
  draft.bankName = "";
  draft.account = "";
  draft.corrAccount = "";
  draft.bik = "";
}

function applyLabeled(
  key: string,
  value: string,
  preview: LegalCardPreview,
  draft: BankDraft,
  banks: LegalCardBank[],
) {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return;
  if (key === "inn") {
    const d = digitsOnly(v);
    if (looksLikeInn(d)) preview.inn = d;
    return;
  }
  if (key === "ogrnip") {
    const d = digitsOnly(v);
    if (looksLikeOgrnip(d)) preview.ogrnip = d;
    return;
  }
  if (key === "companyName") {
    preview.companyName = shortenName(v);
    return;
  }
  if (key === "fullName") {
    preview.fullName = expandShortName(v);
    return;
  }
  if (key === "legalAddress") {
    preview.legalAddress = v;
    return;
  }
  if (key === "actualAddress") {
    preview.actualAddress = v;
    return;
  }
  if (key === "bank") {
    draft.bankName = v.replace(/^банк\s+/i, "");
    if (/т[\s-]?банк|tinkoff|тинькофф/i.test(v)) draft.label = "Т-Банк";
    else if (/сбер/i.test(v)) draft.label = "Сбер";
    return;
  }
  if (key === "account") {
    const d = digitsOnly(v);
    if (looksLikeAccount(d)) {
      if (draft.account && draft.account !== d) flushBank(banks, draft);
      draft.account = d;
    }
    return;
  }
  if (key === "corr") {
    const d = digitsOnly(v);
    if (d.length >= 16) draft.corrAccount = d;
    return;
  }
  if (key === "bik") {
    const d = digitsOnly(v);
    if (looksLikeBik(d)) {
      if (draft.bik && draft.bik !== d && draft.account) flushBank(banks, draft);
      draft.bik = d;
    }
  }
}

export function parseEnterpriseCard(raw: string): LegalCardParseResult {
  const text = stripJunk(raw);
  const warnings: string[] = [];
  const preview: LegalCardPreview = { ...EMPTY, banks: [] };
  const banks: LegalCardBank[] = [];
  const draft: BankDraft = {
    label: "",
    bankName: "",
    account: "",
    corrAccount: "",
    bik: "",
  };

  preview.email = firstEmail(text);
  preview.phone = firstPhone(text);

  const edo = text.match(/оператор\s+эдо:\s*(.+)/i);
  if (edo) preview.edoOperator = edo[1].split("\n")[0].trim();

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0 && !/^карточка предприятия$/i.test(l));

  let pending: (typeof LABEL_NEXT)[string] | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("e-mail") || lower.startsWith("email") || lower.startsWith("tel")) {
      continue;
    }
    if (
      /^оператор\s+эдо/i.test(line) ||
      /^идентификатор участника/i.test(line) ||
      /^банковские реквизиты$/i.test(line)
    ) {
      continue;
    }

    const prefixed = line.match(
      /^(инн|огрнип|огрн|бик|р\/сч?(?:ёт|ет)?|к\/сч?(?:ёт|ет)?|кор\/сч(?:ёт|ет)?)\s*[:.]?\s+(.+)$/i,
    );
    if (prefixed) {
      const key =
        LABEL_NEXT[normalizeLabel(prefixed[1])] ||
        (prefixed[1].toLowerCase().startsWith("к") ? "corr" : null);
      if (key) applyLabeled(key, prefixed[2], preview, draft, banks);
      continue;
    }

    const bankPref = line.match(/^банк\s+(.+)$/i);
    if (bankPref && !line.includes(":")) {
      applyLabeled("bank", bankPref[1], preview, draft, banks);
      continue;
    }

    if (pending) {
      applyLabeled(pending, line, preview, draft, banks);
      pending = null;
      continue;
    }

    const same = sameLineValue(line);
    if (same) {
      const mapped = LABEL_NEXT[same.label];
      if (mapped) {
        applyLabeled(mapped, same.value, preview, draft, banks);
        continue;
      }
      if (same.label.includes("тел")) continue;
      if (same.label.includes("mail")) continue;
    }

    const nl = normalizeLabel(line);
    if (LABEL_NEXT[nl]) {
      pending = LABEL_NEXT[nl];
      continue;
    }

    if (!preview.companyName && isNameLine(line)) {
      preview.companyName = shortenName(line);
      preview.fullName = expandShortName(line);
      continue;
    }

    if (!preview.legalAddress && isAddressLine(line) && !/инн|огрн|бик|счет|счёт/i.test(line)) {
      preview.legalAddress = line;
      continue;
    }

    const innInline = line.match(/инн[:\s]+([\d.\s]+)/i);
    if (innInline) {
      const d = digitsOnly(innInline[1]);
      if (looksLikeInn(d)) preview.inn = d;
    }
    const ogrnInline = line.match(/огрнип[:\s]+([\d.\s]+)/i);
    if (ogrnInline) {
      const d = digitsOnly(ogrnInline[1]);
      if (looksLikeOgrnip(d)) preview.ogrnip = d;
    }
  }

  if (!draft.account && !banks.some((b) => b.account)) {
    const acc = text.match(
      /(?:р\s*\/\s*сч?(?:ёт|ет)?|расч[её]тн\w*\s+сч[её]т)\s*[:.]?\s*(\d[\d.\s]{16,28})/i,
    );
    if (acc) {
      const d = digitsOnly(acc[1]);
      if (looksLikeAccount(d)) draft.account = d;
    }
  }
  if (!draft.corrAccount && !banks.some((b) => b.corrAccount)) {
    const corr = text.match(
      /(?:к\s*\/\s*сч?(?:ёт|ет)?|корр?\.?\s*сч[её]т)\s*[:.]?\s*(\d[\d.\s]{16,28})/i,
    );
    if (corr) {
      const d = digitsOnly(corr[1]);
      if (d.length >= 16) draft.corrAccount = d;
    }
  }
  if (!draft.bik && !banks.some((b) => b.bik)) {
    const bik = text.match(/\bБИК\b[^\d]{0,8}(\d{9})\b/i);
    if (bik && looksLikeBik(bik[1])) draft.bik = bik[1];
  }
  if (!draft.bankName && !banks.some((b) => b.bankName)) {
    const bank = text.match(/\bБанк\s+([^\n]+)/i);
    if (bank) draft.bankName = bank[1].replace(/\s+/g, " ").trim();
  }
  flushBank(banks, draft);

  if (!preview.fullName && preview.companyName) {
    preview.fullName = expandShortName(preview.companyName);
  }
  if (!preview.companyName && preview.fullName) {
    preview.companyName = shortenName(preview.fullName);
  }
  if (!preview.actualAddress && preview.legalAddress) {
    preview.actualAddress = preview.legalAddress;
  }

  if (!preview.inn) {
    const m = text.match(/\bИНН\b[^\d]{0,12}(\d[\d.\s]{8,14}\d)/i);
    if (m) {
      const d = digitsOnly(m[1]);
      if (looksLikeInn(d)) preview.inn = d;
    }
  }
  if (!preview.ogrnip) {
    const m = text.match(/\bОГРНИП\b[^\d]{0,12}(\d[\d.\s]{11,18}\d)/i);
    if (m) {
      const d = digitsOnly(m[1]);
      if (looksLikeOgrnip(d)) preview.ogrnip = d;
    }
  }

  preview.banks = banks.filter((b) => b.account || b.bankName);

  if (!preview.inn) warnings.push("Не найден ИНН");
  if (!preview.ogrnip) warnings.push("Не найден ОГРНИП");
  if (!preview.companyName) warnings.push("Не найдено наименование");
  if (!preview.legalAddress) warnings.push("Не найден адрес");
  if (preview.banks.length === 0) warnings.push("Не найдены банковские реквизиты");

  return { preview, warnings };
}

export function formatCardLegalDetails(preview: LegalCardPreview): string {
  const lines: string[] = [];
  if (preview.fullName && preview.fullName !== preview.companyName) {
    lines.push(preview.fullName);
  }
  if (preview.ogrnip) lines.push(`ОГРНИП: ${preview.ogrnip}`);
  for (const b of preview.banks) {
    const bits = [
      b.label && `${b.label}:`,
      b.account && `р/с ${b.account}`,
      b.bankName,
      b.corrAccount && `к/с ${b.corrAccount}`,
      b.bik && `БИК ${b.bik}`,
    ].filter(Boolean);
    if (bits.length) lines.push(bits.join(", "));
  }
  return lines.join("\n");
}

export type ClientLegalPatch = {
  companyName?: string;
  inn?: string;
  legalAddress?: string;
  legalDetails?: string;
  phone?: string;
  email?: string;
};

function nonempty(s: string | undefined): string | undefined {
  const t = (s || "").trim();
  return t || undefined;
}

export function cardPreviewToClientPatch(
  preview: LegalCardPreview,
): ClientLegalPatch {
  const patch: ClientLegalPatch = {};
  const companyName = nonempty(preview.companyName || preview.fullName);
  const inn = nonempty(preview.inn);
  const legalAddress = nonempty(preview.legalAddress || preview.actualAddress);
  const legalDetails = nonempty(formatCardLegalDetails(preview));
  const phone = nonempty(preview.phone);
  const email = nonempty(preview.email);
  if (companyName) patch.companyName = companyName;
  if (inn) patch.inn = inn;
  if (legalAddress) patch.legalAddress = legalAddress;
  if (legalDetails) patch.legalDetails = legalDetails;
  if (phone) patch.phone = phone;
  if (email) patch.email = email;
  return patch;
}
