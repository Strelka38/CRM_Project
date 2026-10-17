import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isBrandFileKind } from "@/lib/brand-public";
import { getBrandLogoPath } from "@/lib/brand-settings";
import { mimeFromStoragePath, resolveUploadPath } from "@/lib/uploads";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (!isBrandFileKind(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let storagePath = await getBrandLogoPath(kind);
  if (!storagePath && kind === "icon") {
    storagePath = await getBrandLogoPath("crm");
  }
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
