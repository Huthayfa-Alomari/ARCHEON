import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { jarvisConfig } from "./config";

export type DeviceKind = "desktop" | "android" | "wearable" | "glasses" | "browser" | "other";
export type DeviceStatus = "online" | "offline" | "revoked";
export type CommandStatus = "queued" | "claimed" | "completed" | "failed" | "expired";

export type MeshDevice = {
  id: string;
  name: string;
  kind: DeviceKind;
  platform?: string;
  appVersion?: string;
  createdAt: string;
  lastSeenAt: string;
  status: DeviceStatus;
  capabilities: string[];
  tokenHash: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type PairingTicket = {
  id: string;
  createdAt: string;
  expiresAt: string;
  codeMac: string;
  attempts: number;
  label?: string;
};

export type DeviceCommand = {
  id: string;
  deviceId: string;
  type: string;
  payload: Record<string, unknown>;
  requiredCapability: string;
  status: CommandStatus;
  createdAt: string;
  expiresAt: string;
  claimedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
};

type MeshState = {
  version: 1;
  devices: MeshDevice[];
  pairings: PairingTicket[];
  commands: DeviceCommand[];
};

const EMPTY_STATE: MeshState = { version: 1, devices: [], pairings: [], commands: [] };
let stateLock: Promise<unknown> = Promise.resolve();

function stateFile() {
  return path.resolve(process.cwd(), jarvisConfig.deviceMeshPath);
}

function keyFile() {
  return path.resolve(process.cwd(), jarvisConfig.deviceMeshKeyPath);
}

async function getMeshSecret(): Promise<Buffer> {
  const fromEnv = jarvisConfig.deviceMeshSecret.trim();
  if (fromEnv) {
    const decoded = Buffer.from(fromEnv, "base64");
    if (decoded.length < 32) throw new Error("JARVIS_DEVICE_MESH_SECRET must be base64 for at least 32 random bytes.");
    return decoded;
  }

  const target = keyFile();
  try {
    const raw = (await fs.readFile(target, "utf8")).trim();
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length >= 32) return decoded;
  } catch {
    // First run creates a local secret so pairing survives restarts.
  }

  const secret = randomBytes(32);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, secret.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return secret;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function pairingMac(ticketId: string, code: string) {
  const secret = await getMeshSecret();
  return createHmac("sha256", secret).update(`${ticketId}:${code}`, "utf8").digest("hex");
}

function equalHex(a: string, b: string) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

async function readState(): Promise<MeshState> {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFile(), "utf8")) as Partial<MeshState>;
    return {
      version: 1,
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      pairings: Array.isArray(parsed.pairings) ? parsed.pairings : [],
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
    };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

async function writeState(state: MeshState) {
  const target = stateFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf8");
}

function prune(state: MeshState) {
  const now = Date.now();
  state.pairings = state.pairings.filter((item) => Date.parse(item.expiresAt) > now);
  state.commands = state.commands.filter((item) => {
    if (item.status === "completed" || item.status === "failed") return Date.parse(item.createdAt) > now - 7 * 86400_000;
    return Date.parse(item.expiresAt) > now || item.status === "claimed";
  });
  for (const command of state.commands) {
    if ((command.status === "queued" || command.status === "claimed") && Date.parse(command.expiresAt) <= now) command.status = "expired";
  }
  for (const device of state.devices) {
    if (device.status === "revoked") continue;
    device.status = Date.parse(device.lastSeenAt) >= now - jarvisConfig.deviceOfflineAfterMs ? "online" : "offline";
  }
}

async function mutate<T>(fn: (state: MeshState) => Promise<T> | T): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const previous = stateLock;
  stateLock = previous.then(() => next, () => next);
  await previous.catch(() => undefined);
  try {
    const state = await readState();
    prune(state);
    const result = await fn(state);
    await writeState(state);
    return result;
  } finally {
    release();
  }
}

export async function startPairing(label?: string) {
  const id = randomUUID();
  const code = randomInt(100000, 1000000).toString();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + jarvisConfig.devicePairingTtlMinutes * 60_000);
  const ticket: PairingTicket = {
    id,
    codeMac: await pairingMac(id, code),
    attempts: 0,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    label: label?.trim().slice(0, 80) || undefined,
  };
  await mutate((state) => { state.pairings.push(ticket); });
  return { pairingId: id, code, expiresAt: ticket.expiresAt };
}

export async function completePairing(input: {
  pairingId: string;
  code: string;
  name: string;
  kind: DeviceKind;
  platform?: string;
  appVersion?: string;
  capabilities?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const expectedMac = await pairingMac(input.pairingId, input.code);
  return mutate((state) => {
    const index = state.pairings.findIndex((item) => item.id === input.pairingId);
    if (index < 0) throw new Error("Pairing code is invalid or expired.");
    const ticket = state.pairings[index];
    if (!equalHex(ticket.codeMac, expectedMac)) {
      ticket.attempts = (ticket.attempts || 0) + 1;
      if (ticket.attempts >= 5) state.pairings.splice(index, 1);
      throw new Error("Pairing code is invalid or expired.");
    }
    state.pairings.splice(index, 1);

    const token = randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    const device: MeshDevice = {
      id: randomUUID(),
      name: input.name.trim().slice(0, 100) || "Unnamed device",
      kind: input.kind,
      platform: input.platform?.trim().slice(0, 80),
      appVersion: input.appVersion?.trim().slice(0, 40),
      createdAt: now,
      lastSeenAt: now,
      status: "online",
      capabilities: [...new Set((input.capabilities || []).map((v) => v.trim()).filter(Boolean))].slice(0, 64),
      tokenHash: tokenHash(token),
      metadata: input.metadata,
    };
    state.devices.push(device);
    return { token, device: publicDevice(device) };
  });
}

export function publicDevice(device: MeshDevice) {
  const { tokenHash: _tokenHash, ...safe } = device;
  return safe;
}

export async function listDevices() {
  return mutate((state) => state.devices.map(publicDevice));
}

export async function getDevice(deviceId: string) {
  return mutate((state) => {
    const found = state.devices.find((item) => item.id === deviceId);
    return found ? publicDevice(found) : null;
  });
}

export async function authenticateDevice(token: string) {
  const hash = tokenHash(token);
  return mutate((state) => {
    const device = state.devices.find((item) => item.status !== "revoked" && equalHex(item.tokenHash, hash));
    if (!device) return null;
    device.lastSeenAt = new Date().toISOString();
    device.status = "online";
    return publicDevice(device);
  });
}

export async function revokeDevice(deviceId: string) {
  return mutate((state) => {
    const device = state.devices.find((item) => item.id === deviceId);
    if (!device) return false;
    device.status = "revoked";
    device.tokenHash = tokenHash(randomBytes(32).toString("base64url"));
    return true;
  });
}

export async function heartbeat(deviceId: string, capabilities?: string[], metadata?: Record<string, string | number | boolean | null>) {
  return mutate((state) => {
    const device = state.devices.find((item) => item.id === deviceId && item.status !== "revoked");
    if (!device) throw new Error("Unknown or revoked device.");
    device.lastSeenAt = new Date().toISOString();
    device.status = "online";
    if (capabilities) device.capabilities = [...new Set(capabilities.map((v) => v.trim()).filter(Boolean))].slice(0, 64);
    if (metadata) device.metadata = { ...(device.metadata || {}), ...metadata };
    return publicDevice(device);
  });
}

export async function enqueueCommand(input: {
  deviceId: string;
  type: string;
  payload?: Record<string, unknown>;
  requiredCapability: string;
  ttlSeconds?: number;
}) {
  return mutate((state) => {
    const device = state.devices.find((item) => item.id === input.deviceId && item.status !== "revoked");
    if (!device) throw new Error("Device not found or revoked.");
    if (!device.capabilities.includes(input.requiredCapability)) throw new Error(`Device does not advertise capability: ${input.requiredCapability}`);
    const createdAt = new Date();
    const ttl = Math.max(15, Math.min(input.ttlSeconds ?? 300, 3600));
    const command: DeviceCommand = {
      id: randomUUID(),
      deviceId: device.id,
      type: input.type.trim().slice(0, 80),
      payload: input.payload || {},
      requiredCapability: input.requiredCapability,
      status: "queued",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ttl * 1000).toISOString(),
    };
    state.commands.push(command);
    return command;
  });
}

export async function pollCommands(deviceId: string, limit = 10) {
  return mutate((state) => {
    const now = new Date().toISOString();
    const selected = state.commands
      .filter((item) => item.deviceId === deviceId && item.status === "queued")
      .slice(0, Math.max(1, Math.min(limit, 20)));
    for (const item of selected) {
      item.status = "claimed";
      item.claimedAt = now;
    }
    return selected;
  });
}

export async function completeCommand(deviceId: string, commandId: string, ok: boolean, result?: unknown, error?: string) {
  return mutate((state) => {
    const command = state.commands.find((item) => item.id === commandId && item.deviceId === deviceId);
    if (!command) throw new Error("Command not found.");
    if (!["claimed", "queued"].includes(command.status)) throw new Error(`Command is already ${command.status}.`);
    command.status = ok ? "completed" : "failed";
    command.completedAt = new Date().toISOString();
    command.result = result;
    command.error = error?.slice(0, 1000);
    return command;
  });
}

export async function recentCommands(deviceId?: string, limit = 30) {
  return mutate((state) => state.commands
    .filter((item) => !deviceId || item.deviceId === deviceId)
    .slice(-Math.max(1, Math.min(limit, 100)))
    .reverse());
}

export async function deviceMeshStatus() {
  const devices = await listDevices();
  return {
    enabled: true,
    devices: devices.length,
    online: devices.filter((d) => d.status === "online").length,
    revoked: devices.filter((d) => d.status === "revoked").length,
    kinds: [...new Set(devices.map((d) => d.kind))],
  };
}
