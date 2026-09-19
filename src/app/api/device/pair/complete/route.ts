import { NextResponse } from "next/server";
import { completePairing, type DeviceKind } from "@/lib/jarvis/device-mesh";
import { grantCapabilities, requestCapabilities } from "@/lib/jarvis/permission-broker";
import { audit } from "@/lib/jarvis/audit";

export const runtime = "nodejs";

type Body = {
  pairingId?: string; code?: string; name?: string; kind?: DeviceKind; platform?: string; appVersion?: string;
  capabilities?: string[]; requestedCapabilities?: string[]; metadata?: Record<string, string | number | boolean | null>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.pairingId || !body.code || !body.name || !body.kind) return NextResponse.json({ error: "pairingId, code, name and kind are required" }, { status: 400 });
    const paired = await completePairing({
      pairingId: body.pairingId, code: body.code, name: body.name, kind: body.kind,
      platform: body.platform, appVersion: body.appVersion, capabilities: body.capabilities, metadata: body.metadata,
    });
    await grantCapabilities(paired.device.id, ["mesh.heartbeat"], undefined, "automatic low-risk pairing grant");
    let permissionRequest = null;
    if (Array.isArray(body.requestedCapabilities) && body.requestedCapabilities.length) {
      permissionRequest = await requestCapabilities(paired.device.id, body.requestedCapabilities, "requested by companion during pairing");
    }
    await audit({ event: "device.paired", ok: true, detail: `${paired.device.id} ${paired.device.name} ${paired.device.kind}` });
    return NextResponse.json({ ok: true, token: paired.token, device: paired.device, permissionRequest });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pairing failed";
    await audit({ event: "device.pair.failed", ok: false, detail: message.slice(0, 300) });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
