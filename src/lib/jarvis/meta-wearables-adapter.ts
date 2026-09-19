import { enqueueCommand } from "./device-mesh";
import { hasCapabilityGrant } from "./permission-broker";

async function requireGrant(deviceId: string, capability: string) {
  if (!(await hasCapabilityGrant(deviceId, capability))) throw new Error(`Permission Broker denied ${capability} for ${deviceId}.`);
}

export async function requestMetaPhoto(deviceId: string) {
  await requireGrant(deviceId, "meta.camera.capture");
  return enqueueCommand({ deviceId, type: "meta.camera.capture", requiredCapability: "meta.camera.capture", payload: {}, ttlSeconds: 180 });
}

export async function requestMetaStream(deviceId: string, action: "start" | "stop", quality: "low" | "medium" | "high" = "medium") {
  await requireGrant(deviceId, "meta.camera.stream");
  return enqueueCommand({
    deviceId,
    type: `meta.camera.stream.${action}`,
    requiredCapability: "meta.camera.stream",
    payload: { quality },
    ttlSeconds: 180,
  });
}

export async function renderMetaDisplay(deviceId: string, text: string) {
  await requireGrant(deviceId, "meta.display.render");
  return enqueueCommand({
    deviceId,
    type: "meta.display.render",
    requiredCapability: "meta.display.render",
    payload: { text: text.slice(0, 4000) },
    ttlSeconds: 180,
  });
}
