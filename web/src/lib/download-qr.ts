/** Скачать QR-код ссылки как PNG (генерируется в браузере). */
export async function downloadQrPng(url: string, filename: string) {
  const QRCode = await import("qrcode");
  const toDataURL =
    QRCode.toDataURL ??
    (QRCode.default && "toDataURL" in QRCode.default
      ? QRCode.default.toDataURL
      : null);
  if (!toDataURL) throw new Error("QR generator unavailable");
  const dataUrl = await toDataURL(url, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#070a12", light: "#ffffff" },
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
