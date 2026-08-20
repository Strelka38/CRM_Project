/** Knock out black background of stamp/signature scans (multiply / chroma-key). */

export async function knockOutBlackToPng(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blobToDataUrl(blob);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxc = Math.max(r, g, b);
    if (maxc < 28) {
      d[i + 3] = 0;
      continue;
    }
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < 22 && maxc < 48) {
      d[i + 3] = 0;
      continue;
    }
    d[i + 3] = Math.min(255, Math.round((maxc / 255) * 255));
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
