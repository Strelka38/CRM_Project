import assert from "node:assert/strict";
import {
  buildContractText,
  buildInvoiceText,
  buildActText,
  formatAmountLine,
  subjectLine,
  customerWarnings,
  type LegalDocInput,
} from "./legal-docs";

const input: LegalDocInput = {
  city: "г. Тестовск",
  contractNumber: "90",
  contractDate: "20.08.2026",
  paymentDue: "09.04.2026",
  amount: 86950,
  eventName: "выездное совещание",
  eventDate: "09.04.2026",
  venue: "Площадка Тест",
  executor: {
    shortName: "ИП Иванов Иван Иванович",
    fullName: "Индивидуальный предприниматель Иванов Иван Иванович",
    inn: "123456789012",
    ogrnip: "123456789012345",
    legalAddress: "ул. Примерная, д. 1",
    phone: "+7-900-000-00-00",
    email: "test@example.com",
    signatoryName: "Иванов И.И.",
  },
  bank: {
    label: "Сбер",
    bankName: "ПАО СБЕРБАНК",
    account: "40802810100000000001",
    corrAccount: "30101810400000000225",
    bik: "044525225",
  },
  customer: {
    companyName: 'АО "Тест"',
    contactName: "",
    inn: "",
    legalAddress: "",
    legalDetails: "",
    phone: "",
    email: "",
  },
};

assert.match(formatAmountLine(86950), /восемьдесят шесть тысяч/);
assert.match(subjectLine(input), /Площадка Тест/);
assert.ok(customerWarnings(input.customer).some((w) => /ИНН/.test(w)));

const contract = buildContractText(input);
assert.match(contract, /ДОГОВОР ОКАЗАНИЯ УСЛУГ № 90/);
assert.match(contract, /123456789012/);
assert.match(contract, /АУСН/);
assert.match(contract, /40802810100000000001/);
assert.match(contract, /НДС не облагается/);

const invoice = buildInvoiceText(input);
assert.match(invoice, /Счёт на оплату/);
assert.match(invoice, /АУСН/);

const act = buildActText(input);
assert.match(act, /Акт сдачи-приемки/);
assert.match(act, /Иванов И\.И\./);

console.log("legal-docs.test.ts: ok");
