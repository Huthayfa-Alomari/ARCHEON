import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/jarvis/device-api";
import { pollCommands } from "@/lib/jarvis/device-mesh";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const device = await requireDevice(req);
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const commands = await pollCommands(device.id, Number(body.limit) || 10);
    return NextResponse.json({ ok: true, commands });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}
