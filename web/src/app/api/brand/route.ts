import { NextResponse } from "next/server";
import { getBrandSettings } from "@/lib/brand-settings";

export async function GET() {
  const brand = await getBrandSettings();
  return NextResponse.json(brand);
}
