import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/jarvis/device-api";
import { listCapabilityGrants } from "@/lib/jarvis/permission-broker";
import { healthVaultStatus } from "@/lib/jarvis/health-vault";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const device = await requireDevice(req);
    const grants = await listCapabilityGrants(device.id);
    return NextResponse.json({ ok: true, device, grants, healthVault: healthVaultStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}
