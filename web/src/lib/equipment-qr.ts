/** Токен из QR единицы: URL `/q/{token}` или сам base64url-токен. */
export function parseEquipmentQrValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const fromPath = (pathname: string) => {
    const match = pathname.match(/\/q\/([^/?#]+)\/?$/i);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  };

  try {
    const url = new URL(value);
    const token = fromPath(url.pathname);
    if (token) return token;
  } catch {
    // не абсолютный URL
  }

  const asPath = value.startsWith("/")
    ? value
    : value.toLowerCase().startsWith("q/")
      ? `/${value}`
      : "";
  if (asPath) {
    const token = fromPath(asPath.split(/[?#]/, 1)[0] ?? asPath);
    if (token) return token;
  }

  if (/^[A-Za-z0-9_-]{8,64}$/.test(value)) return value;
  return null;
}
