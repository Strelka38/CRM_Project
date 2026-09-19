/**
 * Агент GPT-6 Astra (Kie): карта репозитория → обзор UI и кода → markdown-отчёт.
 *
 * Ключ только из окружения, в git не класть:
 *   export KIE_API_KEY="..."
 *   node scripts/kie-astra-review.mjs
 *
 * Опции:
 *   --effort low|medium|high|xhigh   (по умолчанию medium)
 *   --max-steps N                     (по умолчанию 28)
 *   --out path                        (по умолчанию reports/astra-review.md)
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIE_URL = "https://api.kie.ai/codex/v1/responses";
const MODEL = "gpt-6-astra";

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "out",
  "coverage",
  "uploads",
  "backups",
  "data",
  "legal-source",
  "reports",
]);

const SKIP_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
]);

const SECRET_NAME =
  /(^|\/)\.env($|\.)|credentials|secret|private[_\-]?key|\.pem$|\.p12$|\.tar\.gz$/i;

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|sql|prisma|yml|yaml|toml|sh|svg|html|txt)$/i;

const args = parseArgs(process.argv.slice(2));
hydrateEnv();

const apiKey = (process.env.KIE_API_KEY || "").trim();
if (!apiKey) {
  console.error(
    "Нет KIE_API_KEY. В этом же терминале:\n  export KIE_API_KEY=\"...\"\n  node scripts/kie-astra-review.mjs",
  );
  process.exit(1);
}

const outPath = resolve(ROOT, args.out);
const effort = args.effort;
const maxSteps = args.maxSteps;

const TOOLS = [
  {
    type: "function",
    name: "list_dir",
    description: "List files and folders in a directory relative to the repo root.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory, e.g. web/src/app or .",
        },
      },
      required: ["path"],
    },
  },
  {
    type: "function",
    name: "glob",
    description: "Find files by glob-like suffix/segment match. Recursive, skips node_modules/.git/.next.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "e.g. **/*.tsx, web/src/app/api/**/route.ts, globals.css",
        },
        max_results: { type: "integer", description: "Default 80, max 200" },
      },
      required: ["pattern"],
    },
  },
  {
    type: "function",
    name: "grep",
    description: "Search file contents with a regex. Prefer this over reading huge files blindly.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JavaScript regex source" },
        glob: {
          type: "string",
          description: "Optional file filter, e.g. *.{ts,tsx} or web/src/lib/*.ts",
        },
        max_results: { type: "integer", description: "Default 40, max 80" },
      },
      required: ["pattern"],
    },
  },
  {
    type: "function",
    name: "read_file",
    description: "Read a text file. Use offset/limit for large files (1-based lines).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path from repo root" },
        offset: { type: "integer", description: "1-based start line" },
        limit: { type: "integer", description: "Max lines to return (default 220, max 400)" },
      },
      required: ["path"],
    },
  },
];

const INSTRUCTIONS = `Ты агент-ревьюер CRM «Гранд Байкал» (Next.js в web/).
Работай только через инструменты. Код не меняй. Секреты, .env, ключи, дампы и tar.gz не читай.

Задача: просканировать репозиторий и написать практичный отчёт по дизайну UI и оптимизации кода.

Порядок:
1) Карта: web/src/app, web/src/components, web/src/lib, web/src/app/api, prisma, scripts.
2) Дизайн: globals.css (токены), layout, ui-kit (web/src/components/ui), крупные экраны — сметы, каталог, календарь, логин. Смотри консистентность, плотность, тёмную/светлую тему, мобильный layout, дубли стилей, мёртвые токены.
3) Код: тяжёлые клиентские компоненты, дубли логики, N+1/лишние fetch, client/server границы, мёртвый код, узкие места в quote/spec/stock/payroll.
4) Не предлагай нарушать инварианты CRM:
   - склад не блокирует сохранение сметы (нет 409 из‑за дефицита);
   - спецификация — снимок, смена статуса не пересобирает спеку;
   - в выручку владельца идёт маржа (клиент − закуп), не вся сумма клиента.
5) Вне скоупа: Kotlin, 1С, ЭДО, AI-сборка сметы, замена CatalogOwner юрлицами.

Формат финального ответа — ТОЛЬКО markdown, без преамбулы:
# Обзор CRM — GPT-6 Astra
## Карта репозитория
## Дизайн (P0 / P1 / P2)
## Оптимизация кода (P0 / P1 / P2)
## Что не трогать
## Как проверять

Каждый пункт: файл:строка если возможно, в чём проблема, конкретное улучшение, зачем. Без воды и без «переписать всё». 8–16 пунктов суммарно. Русский язык.`;

const USER_PROMPT = `${INSTRUCTIONS}

Просканируй репозиторий CRM по пути ${ROOT}.

Стартовые ориентиры (проверь сам, не верь слепо):
- Next.js app router: web/src/app/(app)/**/page.tsx
- UI-kit: web/src/components/ui
- Тема: web/src/app/globals.css
- Навигация: web/src/lib/nav-sections.ts
- Крупные редакторы: сметы, спецификация, каталог, оборудование, календарь

Сначала list_dir / glob, потом точечный grep и read_file. Когда данных достаточно — отдай финальный markdown-отчёт.`;

const handlers = {
  list_dir: toolListDir,
  glob: toolGlob,
  grep: toolGrep,
  read_file: toolReadFile,
};

await main();

async function main() {
  console.log(`Astra review · model=${MODEL} effort=${effort} maxSteps=${maxSteps}`);
  console.log(`out ${relative(ROOT, outPath)}`);

  /** @type {Array<Record<string, unknown>>} */
  const history = [
    {
      role: "user",
      content: [{ type: "input_text", text: USER_PROMPT }],
    },
  ];
  let lastText = "";
  let lastUsage = null;

  for (let step = 1; step <= maxSteps; step += 1) {
    process.stdout.write(`\n[${step}/${maxSteps}] Astra… `);
    const { response } = await kieCreate({ input: windowHistory(history) });

    lastUsage = response.usage || lastUsage;
    const calls = extractFunctionCalls(response);
    const text = extractOutputText(response);
    if (text) lastText = text;

    if (!calls.length) {
      console.log("готово");
      if (!lastText.trim()) {
        throw new Error("Astra вернула ответ без текста и без tool calls.");
      }
      writeReport(lastText, { steps: step, usage: lastUsage });
      return;
    }

    console.log(calls.map((c) => `${c.name}(${shortArgs(c.arguments)})`).join(", "));
    const outputs = [];
    for (const call of calls) {
      const result = runTool(call.name, call.arguments);
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: result,
      });
    }

    const replay = [...calls.map(toReplayCall), ...outputs];
    history.push(...replay);
  }

  if (!lastText.trim()) {
    throw new Error(`Лимит шагов (${maxSteps}) без финального отчёта.`);
  }
  console.warn(`\nЛимит шагов ${maxSteps}. Сохраняю последний текст модели.`);
  writeReport(lastText, { steps: maxSteps, usage: lastUsage, truncated: true });
}

function windowHistory(history) {
  if (history.length <= 80) return history;
  return [history[0], ...history.slice(-79)];
}

function parseArgs(argv) {
  const out = {
    effort: "medium",
    maxSteps: 28,
    out: "reports/astra-review.md",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--effort" && next) {
      out.effort = next;
      i += 1;
    } else if (a === "--max-steps" && next) {
      out.maxSteps = Math.max(4, Number(next) || 28);
      i += 1;
    } else if (a === "--out" && next) {
      out.out = next;
      i += 1;
    }
  }
  if (!["low", "medium", "high", "xhigh"].includes(out.effort)) {
    throw new Error(`Неизвестный --effort ${out.effort}`);
  }
  return out;
}

function hydrateEnv() {
  if (process.env.KIE_API_KEY) return;
  for (const file of [join(ROOT, ".env"), join(ROOT, "web", ".env")]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const match = text.match(/^KIE_API_KEY=(.*)$/m);
    if (!match) continue;
    const value = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (value) process.env.KIE_API_KEY = value;
    break;
  }
}

async function kieCreate({ input }) {
  const body = {
    model: MODEL,
    stream: false,
    tool_choice: "auto",
    tools: TOOLS,
    reasoning: { effort },
    input,
  };

  const res = await fetch(KIE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Kie HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  const parsed = parseKieBody(raw);
  if (!parsed) {
    throw new Error(`Не разобрал ответ Kie: ${raw.slice(0, 400)}`);
  }
  return { response: parsed };
}

function parseKieBody(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return unwrap(JSON.parse(trimmed));
  }
  let completed = null;
  for (const block of trimmed.split("\n\n")) {
    const dataLine = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!dataLine || dataLine === "[DONE]") continue;
    try {
      const json = JSON.parse(dataLine);
      if (json.type === "response.completed" && json.response) {
        completed = json.response;
      } else if (json.output || json.output_text) {
        completed = json.response || json;
      }
    } catch {
      // keep scanning SSE
    }
  }
  return completed ? unwrap(completed) : null;
}

function unwrap(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.data && (payload.data.output || payload.data.output_text)) {
    return payload.data;
  }
  if (payload.response && (payload.response.output || payload.response.output_text)) {
    return payload.response;
  }
  return payload;
}

function extractFunctionCalls(response) {
  const output = Array.isArray(response.output) ? response.output : [];
  const calls = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "function_call" || item.type === "tool_call") {
      calls.push(normalizeCall(item));
      continue;
    }
    const nested = item.tool_calls || item.function_calls;
    if (Array.isArray(nested)) {
      for (const inner of nested) calls.push(normalizeCall(inner));
    }
  }
  return calls.filter(Boolean);
}

function normalizeCall(item) {
  const name = item.name || item.function?.name;
  const callId = item.call_id || item.id;
  if (!name || !callId) return null;
  const rawArgs = item.arguments || item.function?.arguments || "{}";
  let parsed = {};
  if (typeof rawArgs === "string") {
    try {
      parsed = JSON.parse(rawArgs || "{}");
    } catch {
      parsed = {};
    }
  } else if (rawArgs && typeof rawArgs === "object") {
    parsed = rawArgs;
  }
  return {
    type: "function_call",
    id: item.id,
    call_id: callId,
    name,
    arguments: parsed,
    arguments_json: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs || {}),
  };
}

function toReplayCall(call) {
  return {
    type: "function_call",
    id: call.id,
    call_id: call.call_id,
    name: call.name,
    arguments: call.arguments_json,
  };
}

function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const chunks = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === "output_text" && part.text) chunks.push(part.text);
        else if (typeof part?.text === "string") chunks.push(part.text);
      }
    }
    if (typeof item?.text === "string") chunks.push(item.text);
  }
  return chunks.join("\n").trim();
}

function runTool(name, args) {
  const fn = handlers[name];
  if (!fn) return json({ error: `unknown tool ${name}` });
  try {
    return fn(args || {});
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolListDir({ path: rel = "." } = {}) {
  const abs = safeResolve(rel);
  const entries = readdirSync(abs, { withFileTypes: true })
    .filter((entry) => !shouldSkipName(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200)
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "dir" : "file",
    }));
  return json({ path: relPath(abs), entries });
}

function toolGlob({ pattern, max_results: maxResults = 80 } = {}) {
  if (!pattern) return json({ error: "pattern required" });
  const cap = clamp(maxResults, 1, 200);
  const files = walkFiles(ROOT).filter((file) => globMatch(relPath(file), pattern));
  return json({
    pattern,
    count: files.length,
    files: files.slice(0, cap).map((file) => relPath(file)),
    truncated: files.length > cap,
  });
}

function toolGrep({ pattern, glob: globFilter, max_results: maxResults = 40 } = {}) {
  if (!pattern) return json({ error: "pattern required" });
  const cap = clamp(maxResults, 1, 80);
  const rg = spawnSync(
    "rg",
    [
      "-n",
      "--hidden",
      "--glob",
      "!**/.git/**",
      "--glob",
      "!**/node_modules/**",
      "--glob",
      "!**/.next/**",
      ...(globFilter ? ["--glob", globFilter] : []),
      "-e",
      pattern,
      ".",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 2_000_000 },
  );

  if (rg.error && rg.error.code === "ENOENT") {
    return json(nodeGrep(pattern, globFilter, cap));
  }

  const lines = (rg.stdout || "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const matches = lines.slice(0, cap).map(parseRgLine);
  return json({
    pattern,
    count: lines.length,
    matches,
    truncated: lines.length > cap,
    warning: rg.status === 2 ? (rg.stderr || "").slice(0, 400) : undefined,
  });
}

function toolReadFile({ path: rel, offset = 1, limit = 220 } = {}) {
  const abs = safeResolve(rel);
  if (SECRET_NAME.test(rel) || SKIP_FILES.has(rel.split(/[\\/]/).pop() || "")) {
    return json({ error: "refusing to read secrets" });
  }
  if (!TEXT_EXT.test(abs) && !abs.endsWith("Dockerfile") && !abs.endsWith("Dockerfile.web")) {
    return json({ error: "not a text source file" });
  }
  const text = readFileSync(abs, "utf8");
  const lines = text.split("\n");
  const start = clamp(offset, 1, Math.max(1, lines.length));
  const cap = clamp(limit, 1, 400);
  const slice = lines.slice(start - 1, start - 1 + cap);
  const numbered = slice.map((line, i) => `${start + i}|${line}`).join("\n");
  return json({
    path: relPath(abs),
    start,
    end: start + slice.length - 1,
    total_lines: lines.length,
    truncated: start - 1 + cap < lines.length,
    content: numbered,
  });
}

function nodeGrep(pattern, globFilter, cap) {
  const re = new RegExp(pattern);
  const files = walkFiles(ROOT).filter((file) => {
    if (!TEXT_EXT.test(file)) return false;
    return globFilter ? globMatch(relPath(file), globFilter) : true;
  });
  const matches = [];
  for (const file of files) {
    let lines;
    try {
      lines = readFileSync(file, "utf8").split("\n");
    } catch {
      continue;
    }
    lines.forEach((line, i) => {
      if (matches.length >= cap) return;
      if (re.test(line)) {
        matches.push({
          file: relPath(file),
          line: i + 1,
          text: line.slice(0, 240),
        });
      }
    });
    if (matches.length >= cap) break;
  }
  return { pattern, count: matches.length, matches, truncated: matches.length >= cap };
}

function walkFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (shouldSkipName(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, acc);
    else if (entry.isFile()) acc.push(abs);
  }
  return acc;
}

function globMatch(rel, pattern) {
  const normalized = pattern.replace(/^\.\//, "").replaceAll("\\", "/");
  let re = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === "*" && normalized[i + 1] === "*") {
      re += ".*";
      i += 1;
      if (normalized[i + 1] === "/") i += 1;
    } else if (ch === "*") {
      re += "[^/]*";
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`).test(rel.replaceAll("\\", "/"));
}

function shouldSkipName(name) {
  if (SKIP_DIRS.has(name)) return true;
  if (SKIP_FILES.has(name)) return true;
  if (name === ".DS_Store") return true;
  if (SECRET_NAME.test(name)) return true;
  return false;
}

function safeResolve(rel) {
  const abs = resolve(ROOT, String(rel || "."));
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  if (abs !== ROOT && !abs.startsWith(rootWithSep)) {
    throw new Error("path escapes repo root");
  }
  if (!existsSync(abs)) throw new Error(`not found: ${rel}`);
  return abs;
}

function relPath(abs) {
  return relative(ROOT, abs).replaceAll("\\", "/");
}

function parseRgLine(line) {
  const match = line.match(/^(.*?):(\d+):(.*)$/);
  if (!match) return { text: line.slice(0, 240) };
  return { file: match[1], line: Number(match[2]), text: match[3].slice(0, 240) };
}

function writeReport(markdown, meta) {
  mkdirSync(dirname(outPath), { recursive: true });
  const header = [
    `<!-- generated ${new Date().toISOString()} model=${MODEL} effort=${effort} steps=${meta.steps} -->`,
    meta.truncated ? "<!-- truncated: hit max-steps -->" : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(outPath, `${header}${ensureMarkdown(markdown).trim()}\n`, "utf8");
  const usage = meta.usage
    ? ` tokens in=${meta.usage.input_tokens ?? "?"} out=${meta.usage.output_tokens ?? "?"}`
    : "";
  console.log(`\nОтчёт: ${relPath(outPath)}${usage}`);
}

function ensureMarkdown(text) {
  const fence = text.match(/^```(?:markdown|md)\s*([\s\S]*?)```$/i);
  return fence ? fence[1] : text;
}

function shortArgs(obj) {
  const compact = JSON.stringify(obj || {});
  return compact.length > 80 ? `${compact.slice(0, 77)}…` : compact;
}

function clamp(n, min, max) {
  const num = Number(n);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function json(value) {
  return JSON.stringify(value);
}
