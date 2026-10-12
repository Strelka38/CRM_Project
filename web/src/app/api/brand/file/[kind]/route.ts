import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getBrandLogoPath } from "@/lib/brand-settings";
import { mimeFromStoragePath, resolveUploadPath } from "@/lib/uploads";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (kind !== "crm" && kind !== "kp") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const storagePath = await getBrandLogoPath(kind);
  if (!storagePath) {
    return NextResponse.redirect(new URL("/brand/bsg-logo.png", req.url));
  }
  try {
    const data = await readFile(resolveUploadPath(storagePath));
    return new NextResponse(data, {
      headers: {
        "Content-Type": mimeFromStoragePath(storagePath),
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.redirect(new URL("/brand/bsg-logo.png", req.url));
  }
}
