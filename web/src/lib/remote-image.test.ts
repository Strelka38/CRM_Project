import assert from "node:assert/strict";
import {
  extractHtmlImageUrl,
  fetchRemoteImage,
  isBlockedAddress,
  isBlockedHostname,
  normalizeRemoteUrl,
  RemoteImageError,
  sniffImageMime,
} from "./remote-image";

assert.equal(normalizeRemoteUrl("https://cdn.example/a.jpg").href, "https://cdn.example/a.jpg");
assert.equal(normalizeRemoteUrl("cdn.example/a.jpg").protocol, "https:");
assert.throws(() => normalizeRemoteUrl("file:///etc/passwd"), RemoteImageError);
assert.throws(() => normalizeRemoteUrl("http://user:pass@cdn.example/a.jpg"), RemoteImageError);

assert.equal(isBlockedHostname("localhost"), true);
assert.equal(isBlockedHostname("printer.local"), true);
assert.equal(isBlockedHostname("cdn.example"), false);
assert.equal(isBlockedAddress("127.0.0.1"), true);
assert.equal(isBlockedAddress("10.1.2.3"), true);
assert.equal(isBlockedAddress("192.168.0.8"), true);
assert.equal(isBlockedAddress("172.16.5.5"), true);
assert.equal(isBlockedAddress("169.254.169.254"), true);
assert.equal(isBlockedAddress("8.8.8.8"), false);
assert.equal(isBlockedAddress("::1"), true);
assert.equal(isBlockedAddress("::ffff:127.0.0.1"), true);

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBP"),
]);
const gif = Buffer.from("GIF89a");
assert.equal(sniffImageMime(jpeg), "image/jpeg");
assert.equal(sniffImageMime(png), "image/png");
assert.equal(sniffImageMime(webp), "image/webp");
assert.equal(sniffImageMime(gif), "image/gif");
assert.equal(sniffImageMime(Buffer.from("<html></html>")), null);

assert.equal(
  extractHtmlImageUrl(
    `<meta property="og:image" content="https://cdn.example/x.jpg">`,
    "https://shop.example/item",
  ),
  "https://cdn.example/x.jpg",
);
assert.equal(
  extractHtmlImageUrl(
    `<meta content="/img/y.png" property="og:image">`,
    "https://shop.example/item",
  ),
  "https://shop.example/img/y.png",
);
assert.equal(
  extractHtmlImageUrl(
    `<meta name="twitter:image" content="https://cdn.example/t.webp">`,
    "https://shop.example/item",
  ),
  "https://cdn.example/t.webp",
);

const publicLookup = async () => ["1.1.1.1"];

async function main() {
const direct = await fetchRemoteImage("https://cdn.example/a.jpg", {
  lookup: publicLookup,
  fetch: async () =>
    new Response(jpeg, { status: 200, headers: { "Content-Type": "image/jpeg" } }),
});
assert.equal(direct.mimeType, "image/jpeg");

const fromPage = await fetchRemoteImage("https://shop.example/epson", {
  lookup: publicLookup,
  fetch: async (input) => {
    const href = String(input);
    if (href.includes("cdn.example")) {
      return new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    return new Response(
      `<html><head><meta property="og:image" content="https://cdn.example/p.png"></head></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  },
});
assert.equal(fromPage.mimeType, "image/png");

await assert.rejects(
  () =>
    fetchRemoteImage("http://127.0.0.1/secret.jpg", {
      lookup: async () => ["127.0.0.1"],
      fetch: async () => {
        throw new Error("should not fetch");
      },
    }),
  /локальный адрес/,
);

await assert.rejects(
  () =>
    fetchRemoteImage("https://cdn.example/go", {
      lookup: async (host) => (host === "127.0.0.1" ? ["127.0.0.1"] : ["1.1.1.1"]),
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/secret.jpg" },
        }),
    }),
  /локальный адрес/,
);

await assert.rejects(
  () =>
    fetchRemoteImage("https://cdn.example/big.jpg", {
      lookup: publicLookup,
      fetch: async () =>
        new Response(jpeg, {
          status: 200,
          headers: { "Content-Length": String(16 * 1024 * 1024) },
        }),
    }),
      /15 МБ/,
);
}

void main();
