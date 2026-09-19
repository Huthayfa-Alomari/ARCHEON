import { authenticateDevice, type MeshDevice } from "./device-mesh";

export function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function requireDevice(req: Request): Promise<Omit<MeshDevice, "tokenHash">> {
  const token = bearerToken(req);
  if (!token) throw new Error("Missing device bearer token.");
  const device = await authenticateDevice(token);
  if (!device) throw new Error("Invalid or revoked device token.");
  return device;
}
