import { NextResponse } from "next/server";
import { TOOL_DEFINITIONS } from "@/lib/jarvis/tool-registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ tools: TOOL_DEFINITIONS });
}
