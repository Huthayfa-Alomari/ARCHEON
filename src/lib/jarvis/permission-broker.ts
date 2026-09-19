import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";

export type CapabilitySensitivity = "low" | "medium" | "high" | "critical";

export type CapabilityDefinition = {
  id: string;
  description: string;
  sensitivity: CapabilitySensitivity;
};

export const DEVICE_CAPABILITIES: CapabilityDefinition[] = [
  { id: "mesh.heartbeat", description: "Keep the companion presence online.", sensitivity: "low" },
  { id: "device.notifications.push", description: "Show a JARVIS notification on the phone.", sensitivity: "medium" },
  { id: "device.vibrate", description: "Trigger a short vibration on the phone/wearable.", sensitivity: "medium" },
  { id: "device.location.read", description: "Read the phone's current location.", sensitivity: "high" },
  { id: "health.heart_rate.read", description: "Read heart-rate records from Health Connect.", sensitivity: "critical" },
  { id: "health.blood_pressure.read", description: "Read blood-pressure records from Health Connect.", sensitivity: "critical" },
  { id: "health.oxygen_saturation.read", description: "Read oxygen-saturation records from Health Connect.", sensitivity: "critical" },
  { id: "health.steps.read", description: "Read step-count records from Health Connect.", sensitivity: "high" },
  { id: "health.sleep.read", description: "Read sleep sessions from Health Connect.", sensitivity: "critical" },
  { id: "meta.camera.stream", description: "Stream camera frames from compatible Meta glasses through the Android companion.", sensitivity: "critical" },
  { id: "meta.camera.capture", description: "Capture a photo from compatible Meta glasses.", sensitivity: "critical" },
  { id: "meta.display.render", description: "Render JARVIS UI/content on supported Meta display glasses.", sensitivity: "high" },
  { id: "browser.observe", description: "Read the current BrowserSkill-controlled page semantics.", sensitivity: "high" },
  { id: "browser.navigate", description: "Navigate a BrowserSkill-controlled tab.", sensitivity: "high" },
  { id: "browser.interact", description: "Click/fill/select inside a BrowserSkill-controlled tab.", sensitivity: "critical" },
  { id: "browser.borrow_user_tab", description: "Borrow an existing user tab with BrowserSkill confirmation.", sensitivity: "critical" },
];

export type CapabilityGrant = {
  deviceId: string;
  capability: string;
  grantedAt: string;
  expiresAt?: string;
  reason?: string;
};

export type PermissionRequest = {
  id: string;
  deviceId: string;
  capabilities: string[];
  createdAt: string;
  expiresAt: string;
  status: "pending" | "granted" | "denied";
  reason?: string;
  resolvedAt?: string;
};

type PermissionState = { version: 1; grants: CapabilityGrant[]; requests: PermissionRequest[] };
const EMPTY: PermissionState = { version: 1, grants: [], requests: [] };
let lock: Promise<unknown> = Promise.resolve();

function stateFile() { return path.resolve(process.cwd(), jarvisConfig.devicePermissionsPath); }
function knownCapability(id: string) { return DEVICE_CAPABILITIES.find((item) => item.id === id) || null; }

async function readState(): Promise<PermissionState> {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFile(), "utf8")) as Partial<PermissionState>;
    return { version: 1, grants: Array.isArray(parsed.grants) ? parsed.grants : [], requests: Array.isArray(parsed.requests) ? parsed.requests : [] };
  } catch { return structuredClone(EMPTY); }
}

async function writeState(state: PermissionState) {
  await fs.mkdir(path.dirname(stateFile()), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify(state, null, 2), "utf8");
}

function prune(state: PermissionState) {
  const now = Date.now();
  state.grants = state.grants.filter((g) => !g.expiresAt || Date.parse(g.expiresAt) > now);
  for (const req of state.requests) {
    if (req.status === "pending" && Date.parse(req.expiresAt) <= now) {
      req.status = "denied";
      req.resolvedAt = new Date().toISOString();
      req.reason = req.reason || "expired";
    }
  }
  state.requests = state.requests.filter((r) => Date.parse(r.createdAt) > now - 14 * 86400_000);
}

async function mutate<T>(fn: (state: PermissionState) => T | Promise<T>) {
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  const prev = lock;
  lock = prev.then(() => next, () => next);
  await prev.catch(() => undefined);
  try {
    const state = await readState();
    prune(state);
    const out = await fn(state);
    await writeState(state);
    return out;
  } finally { release(); }
}

export function capabilityCatalog() { return DEVICE_CAPABILITIES; }

export async function hasCapabilityGrant(deviceId: string, capability: string) {
  return mutate((state) => state.grants.some((g) => g.deviceId === deviceId && g.capability === capability));
}

export async function listCapabilityGrants(deviceId?: string) {
  return mutate((state) => state.grants.filter((g) => !deviceId || g.deviceId === deviceId));
}

export async function requestCapabilities(deviceId: string, capabilities: string[], reason?: string) {
  const normalized = [...new Set(capabilities.map((v) => v.trim()).filter(Boolean))];
  if (!normalized.length) throw new Error("At least one capability is required.");
  for (const capability of normalized) {
    if (!knownCapability(capability)) throw new Error(`Unknown capability: ${capability}`);
  }
  const now = new Date();
  const request: PermissionRequest = {
    id: randomUUID(), deviceId, capabilities: normalized,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + jarvisConfig.permissionRequestTtlMinutes * 60_000).toISOString(),
    status: "pending", reason: reason?.slice(0, 300),
  };
  return mutate((state) => { state.requests.push(request); return request; });
}

export async function listPermissionRequests(status?: PermissionRequest["status"]) {
  return mutate((state) => state.requests.filter((r) => !status || r.status === status));
}

export async function resolvePermissionRequest(requestId: string, decision: "grant" | "deny", ttlMinutes?: number) {
  return mutate((state) => {
    const req = state.requests.find((r) => r.id === requestId && r.status === "pending");
    if (!req) throw new Error("Permission request not found, expired, or already resolved.");
    const now = new Date();
    req.status = decision === "grant" ? "granted" : "denied";
    req.resolvedAt = now.toISOString();
    if (decision === "grant") {
      const ttl = ttlMinutes == null ? undefined : Math.max(1, Math.min(ttlMinutes, 60 * 24 * 365));
      const expiresAt = ttl ? new Date(now.getTime() + ttl * 60_000).toISOString() : undefined;
      for (const capability of req.capabilities) {
        state.grants = state.grants.filter((g) => !(g.deviceId === req.deviceId && g.capability === capability));
        state.grants.push({ deviceId: req.deviceId, capability, grantedAt: now.toISOString(), expiresAt, reason: `request:${req.id}` });
      }
    }
    return req;
  });
}

export async function grantCapabilities(deviceId: string, capabilities: string[], ttlMinutes?: number, reason?: string) {
  const normalized = [...new Set(capabilities.map((v) => v.trim()).filter(Boolean))];
  if (!normalized.length) throw new Error("At least one capability is required.");
  for (const capability of normalized) if (!knownCapability(capability)) throw new Error(`Unknown capability: ${capability}`);
  const now = new Date();
  const ttl = ttlMinutes == null ? undefined : Math.max(1, Math.min(ttlMinutes, 60 * 24 * 365));
  const expiresAt = ttl ? new Date(now.getTime() + ttl * 60_000).toISOString() : undefined;
  return mutate((state) => {
    for (const capability of normalized) {
      state.grants = state.grants.filter((g) => !(g.deviceId === deviceId && g.capability === capability));
      state.grants.push({ deviceId, capability, grantedAt: now.toISOString(), expiresAt, reason: reason?.slice(0, 300) });
    }
    return state.grants.filter((g) => g.deviceId === deviceId && normalized.includes(g.capability));
  });
}

export async function revokeCapabilities(deviceId: string, capabilities?: string[]) {
  return mutate((state) => {
    const before = state.grants.length;
    const set = capabilities ? new Set(capabilities) : null;
    state.grants = state.grants.filter((g) => g.deviceId !== deviceId || (set ? !set.has(g.capability) : false));
    return before - state.grants.length;
  });
}
