/** Скачать QR-код ссылки как PNG с подписью единицы сверху. */
export async function downloadQrPng(
  url: string,
  filename: string,
  unitId?: string,
) {
  const QRCode = await import("qrcode");
  const toDataURL =
    QRCode.toDataURL ??
    (QRCode.default && "toDataURL" in QRCode.default
      ? QRCode.default.toDataURL
      : null);
  if (!toDataURL) throw new Error("QR generator unavailable");
  const qrDataUrl = await toDataURL(url, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#070a12", light: "#ffffff" },
  });
  let dataUrl = qrDataUrl;
  if (unitId) {
    const image = new Image();
    image.src = qrDataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("QR image unavailable"));
    });

    const headerHeight = 96;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640 + headerHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#070a12";
    ctx.font = "700 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`ID ${unitId}`, canvas.width / 2, headerHeight / 2);
    ctx.drawImage(image, 0, headerHeight, 640, 640);
    dataUrl = canvas.toDataURL("image/png");
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
