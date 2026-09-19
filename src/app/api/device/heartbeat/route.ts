import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/jarvis/device-api";
import { heartbeat } from "@/lib/jarvis/device-mesh";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const device = await requireDevice(req);
    const body = (await req.json().catch(() => ({}))) as { capabilities?: string[]; metadata?: Record<string, string | number | boolean | null> };
    const updated = await heartbeat(device.id, body.capabilities, body.metadata);
    return NextResponse.json({ ok: true, device: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 }); }
}
