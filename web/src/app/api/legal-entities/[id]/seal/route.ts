import { NextRequest, NextResponse } from "next/server";
import {
  handleFacsimileDelete,
  handleFacsimileGet,
  handleFacsimilePost,
} from "@/lib/legal-facsimile-route";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await handleFacsimileGet(id, "seal");
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await handleFacsimilePost(req, id, "seal");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await handleFacsimileDelete(id, "seal");
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
