import { inflateRawSync } from "node:zlib";

function decodeUtf8(buf: Buffer): string {
  return buf.toString("utf8");
}

function decode1251(buf: Buffer): string {
  try {
    return new TextDecoder("windows-1251").decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

function stripRtf(rtf: string): string {
  let s = rtf.replace(/\\par[d]?/g, "\n").replace(/\\line/g, "\n");
  s = s.replace(/\\tab/g, "\t");
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => {
    const n = parseInt(h, 16);
    return decode1251(Buffer.from([n]));
  });
  s = s.replace(/\\u(-?\d+)\??/g, (_, n) => {
    const code = Number(n);
    const c = code < 0 ? 65536 + code : code;
    return String.fromCharCode(c);
  });
  s = s.replace(/\{\\\*\\[^}]*\}/g, "");
  s = s.replace(/\\[a-zA-Z]+\d* ?/g, "");
  s = s.replace(/[{}]/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^/]*\/>/g, "\t")
    .replace(/<w:br\b[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Minimal ZIP reader: first matching file by suffix, deflate or store. */
function zipFileBytes(buf: Buffer, suffix: string): Buffer | null {
  const needle = suffix.replace(/\\/g, "/").toLowerCase();
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.slice(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) break;
    if (name.replace(/\\/g, "/").toLowerCase().endsWith(needle)) {
      const data = buf.slice(dataStart, dataEnd);
      if (method === 0) return data;
      if (method === 8) {
        try {
          const out = inflateRawSync(data);
          if (uncompSize && out.length !== uncompSize) return out;
          return out;
        } catch {
          return null;
        }
      }
    }
    offset = dataEnd;
  }
  return null;
}

function extractOleStrings(buf: Buffer): string {
  const u16 = buf
    .toString("utf16le")
    .replace(/\u0007/g, "\n")
    .replace(/[^\t\n\r\x20-\x7e\u00a0\u0400-\u04FF]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const cp = decode1251(buf).replace(/[^\t\n\r\x20-\x7e\u00a0\u0400-\u04FF]+/g, "\n");
  const score = (s: string) =>
    (s.match(/ИНН|ОГРНИП|ИП |Банк|р\/с|р\/счет|БИК/gi) || [])
      .length;
  return score(u16) >= score(cp) ? u16 : cp;
}

export function extractCardText(buf: Buffer, filename = ""): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  if (buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "{\\rtf") {
    return stripRtf(decodeUtf8(buf));
  }
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const xml = zipFileBytes(buf, "word/document.xml");
    if (xml) return xmlToText(decodeUtf8(xml));
  }
  if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf) {
    return extractOleStrings(buf);
  }
  if (ext === "rtf") return stripRtf(decodeUtf8(buf));
  if (ext === "docx") {
    const xml = zipFileBytes(buf, "word/document.xml");
    if (xml) return xmlToText(decodeUtf8(xml));
  }
  if (ext === "doc") return extractOleStrings(buf);

  const utf = decodeUtf8(buf);
  if (utf.includes("\uFFFD") || /[\x80-\xff]/.test(utf.slice(0, 200))) {
    const cp = decode1251(buf);
    if ((cp.match(/ИНН|ОГРНИП|ИП /g) || []).length > (utf.match(/ИНН|ОГРНИП|ИП /g) || []).length) {
      return cp;
    }
  }
  return utf.replace(/^\uFEFF/, "");
}

export const CARD_FILE_EXTS = [".txt", ".rtf", ".doc", ".docx"] as const;

export function isCardFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return CARD_FILE_EXTS.some((ext) => lower.endsWith(ext));
}
