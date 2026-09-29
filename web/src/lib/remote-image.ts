import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12_000;

const v4Block = new BlockList();
v4Block.addSubnet("0.0.0.0", 8, "ipv4");
v4Block.addSubnet("10.0.0.0", 8, "ipv4");
v4Block.addSubnet("100.64.0.0", 10, "ipv4");
v4Block.addSubnet("127.0.0.0", 8, "ipv4");
v4Block.addSubnet("169.254.0.0", 16, "ipv4");
v4Block.addSubnet("172.16.0.0", 12, "ipv4");
v4Block.addSubnet("192.168.0.0", 16, "ipv4");
v4Block.addSubnet("224.0.0.0", 4, "ipv4");

const v6Block = new BlockList();
v6Block.addAddress("::", "ipv6");
v6Block.addAddress("::1", "ipv6");
v6Block.addSubnet("fc00::", 7, "ipv6");
v6Block.addSubnet("fe80::", 10, "ipv6");
v6Block.addSubnet("ff00::", 8, "ipv6");

export class RemoteImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteImageError";
  }
}

export type RemoteImage = {
  data: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

type Lookup = (hostname: string) => Promise<string[]>;

export type RemoteImageDeps = {
  fetch: typeof fetch;
  lookup: Lookup;
};

export function normalizeRemoteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new RemoteImageError("Некорректная ссылка");
  }
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new RemoteImageError("Некорректная ссылка");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RemoteImageError("Нужна ссылка http или https");
  }
  if (url.username || url.password) {
    throw new RemoteImageError("Ссылка с логином не поддерживается");
  }
  if (!url.hostname) {
    throw new RemoteImageError("Некорректная ссылка");
  }
  return url;
}

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  const kind = isIP(address);
  if (kind === 4) return v4Block.check(address, "ipv4");
  if (kind === 6) return v6Block.check(address, "ipv6");
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata.internal"
  ) {
    return true;
  }
  if (isIP(host)) return isBlockedAddress(host);
  return false;
}

export function sniffImageMime(data: Buffer): RemoteImage["mimeType"] | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (data.length >= 6) {
    const sig = data.subarray(0, 6).toString("ascii");
    if (sig === "GIF87a" || sig === "GIF89a") return "image/gif";
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    "i",
  );
  const match = tag.match(re);
  if (!match) return null;
  return decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/** Картинка со страницы товара: og:image, twitter:image или link image_src. */
export function extractHtmlImageUrl(html: string, base: string): string | null {
  const slice = html.slice(0, 250_000);
  const metas = slice.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metas) {
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    if (
      key !== "og:image" &&
      key !== "og:image:url" &&
      key !== "twitter:image" &&
      key !== "twitter:image:src"
    ) {
      continue;
    }
    const content = attr(tag, "content");
    if (!content) continue;
    try {
      return new URL(content, base).href;
    } catch {
      continue;
    }
  }
  const links = slice.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = (attr(tag, "rel") || "").toLowerCase().split(/\s+/);
    if (!rel.includes("image_src")) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    try {
      return new URL(href, base).href;
    } catch {
      continue;
    }
  }
  return null;
}

function looksLikeHtml(data: Buffer, contentType: string | null): boolean {
  if ((contentType || "").toLowerCase().includes("text/html")) return true;
  if ((contentType || "").toLowerCase().includes("application/xhtml")) return true;
  const start = data.subarray(0, 64).toString("utf8").trimStart().toLowerCase();
  return start.startsWith("<!doctype html") || start.startsWith("<html") || start.startsWith("<head");
}

async function defaultLookup(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function assertPublicHost(url: URL, resolveHost: Lookup) {
  if (isBlockedHostname(url.hostname)) {
    throw new RemoteImageError("Ссылка на локальный адрес не поддерживается");
  }
  let addresses: string[];
  try {
    addresses = await resolveHost(url.hostname);
  } catch {
    throw new RemoteImageError("Не удалось открыть ссылку");
  }
  if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
    throw new RemoteImageError("Ссылка на локальный адрес не поддерживается");
  }
}

async function readLimited(res: Response): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new RemoteImageError("Файл больше 15 МБ");
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      throw new RemoteImageError("Файл больше 15 МБ");
    }
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new RemoteImageError("Файл больше 15 МБ");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchPublic(
  url: URL,
  deps: RemoteImageDeps,
): Promise<Response> {
  await assertPublicHost(url, deps.lookup);
  try {
    return await deps.fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "image/jpeg,image/png,image/webp,image/gif,text/html;q=0.5",
        "User-Agent": "CRMPhoto/1.0",
      },
    });
  } catch (error) {
    if (error instanceof RemoteImageError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RemoteImageError("Сайт не ответил");
    }
    throw new RemoteImageError("Не удалось открыть ссылку");
  }
}

/**
 * Скачивает картинку по прямой ссылке или со страницы товара (og:image).
 * Локальные и внутренние адреса отбрасываются.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  deps: RemoteImageDeps = { fetch: globalThis.fetch, lookup: defaultLookup },
): Promise<RemoteImage> {
  let current = normalizeRemoteUrl(rawUrl);
  let htmlHops = 0;

  for (let hop = 0; hop < MAX_REDIRECTS + 2; hop++) {
    const res = await fetchPublic(current, deps);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) {
        throw new RemoteImageError("Слишком много переходов по ссылке");
      }
      current = normalizeRemoteUrl(new URL(location, current).href);
      continue;
    }
    if (!res.ok) {
      throw new RemoteImageError(
        res.status === 404 ? "По ссылке ничего нет" : "Не удалось скачать фото",
      );
    }

    const data = await readLimited(res);
    if (data.byteLength === 0) {
      throw new RemoteImageError("По ссылке пустой файл");
    }
    const mimeType = sniffImageMime(data);
    if (mimeType) return { data, mimeType };

    if (htmlHops >= 1 || !looksLikeHtml(data, res.headers.get("content-type"))) {
      throw new RemoteImageError(
        "По ссылке не картинка. Нужен файл jpg, png, webp или gif.",
      );
    }
    const imageUrl = extractHtmlImageUrl(data.toString("utf8"), current.href);
    if (!imageUrl) {
      throw new RemoteImageError(
        "На странице не нашлось фото. Вставьте прямую ссылку на картинку.",
      );
    }
    current = normalizeRemoteUrl(imageUrl);
    htmlHops += 1;
  }

  throw new RemoteImageError("Слишком много переходов по ссылке");
}
