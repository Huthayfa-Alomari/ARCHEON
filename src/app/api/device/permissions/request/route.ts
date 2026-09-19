import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/jarvis/device-api";
import { requestCapabilities } from "@/lib/jarvis/permission-broker";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const device = await requireDevice(req);
    const body = (await req.json()) as { capabilities?: string[]; reason?: string };
    const request = await requestCapabilities(device.id, body.capabilities || [], body.reason);
    return NextResponse.json({ ok: true, request });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Permission request failed" }, { status: 400 }); }
}
