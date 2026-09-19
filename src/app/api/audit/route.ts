import { NextResponse } from "next/server";
import { recentAudit } from "@/lib/jarvis/audit";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ events: await recentAudit(30) });
}
