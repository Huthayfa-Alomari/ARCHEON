import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/jarvis/device-api";
import { ingestHealthSamples, type HealthSample } from "@/lib/jarvis/health-vault";
import { audit } from "@/lib/jarvis/audit";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const device = await requireDevice(req);
    const body = (await req.json()) as { samples?: HealthSample[] };
    if (!Array.isArray(body.samples)) return NextResponse.json({ error: "samples array is required" }, { status: 400 });
    const result = await ingestHealthSamples(device.id, body.samples);
    await audit({ event: "health.ingest", ok: true, detail: `device=${device.id} samples=${result.accepted}` });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health ingest failed";
    await audit({ event: "health.ingest", ok: false, detail: message.slice(0, 300) });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
