import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/jarvis/device-api";
import { completeCommand } from "@/lib/jarvis/device-mesh";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const device = await requireDevice(req);
    const body = (await req.json()) as { commandId?: string; ok?: boolean; result?: unknown; error?: string };
    if (!body.commandId || typeof body.ok !== "boolean") return NextResponse.json({ error: "commandId and ok are required" }, { status: 400 });
    // Keep results bounded; do not use this endpoint for images/audio/video payloads.
    const serialized = body.result === undefined ? "" : JSON.stringify(body.result);
    if (serialized.length > 64_000) return NextResponse.json({ error: "result is too large; media transport is not enabled in v0.7" }, { status: 413 });
    const command = await completeCommand(device.id, body.commandId, body.ok, body.result, body.error);
    return NextResponse.json({ ok: true, command });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Command result failed" }, { status: 400 }); }
}
