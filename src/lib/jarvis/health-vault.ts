import fs from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { jarvisConfig } from "./config";
import { hasCapabilityGrant } from "./permission-broker";

export type HealthType = "heart_rate" | "blood_pressure" | "oxygen_saturation" | "steps" | "sleep";
export type HealthSample = {
  type: HealthType;
  startTime: string;
  endTime?: string;
  value: number | { systolic: number; diastolic: number } | { minutes: number };
  unit: string;
  source?: string;
};

type VaultEnvelope = {
  v: 1;
  deviceId: string;
  createdAt: string;
  fingerprint: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

const CAPABILITY_BY_TYPE: Record<HealthType, string> = {
  heart_rate: "health.heart_rate.read",
  blood_pressure: "health.blood_pressure.read",
  oxygen_saturation: "health.oxygen_saturation.read",
  steps: "health.steps.read",
  sleep: "health.sleep.read",
};

function vaultFile() { return path.resolve(process.cwd(), jarvisConfig.healthVaultPath); }

function keyBytes() {
  const raw = jarvisConfig.healthVaultKey.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("JARVIS_HEALTH_VAULT_KEY must be exactly 32 random bytes encoded as base64.");
  return key;
}

export function healthVaultStatus() {
  let configured = false;
  try { configured = Boolean(keyBytes()); } catch { configured = false; }
  return { configured, isolatedFromGeneralMemory: true, encryption: "AES-256-GCM" };
}

function validateFinite(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid health sample ${field}.`);
}

function validateSample(sample: HealthSample) {
  if (!sample || !CAPABILITY_BY_TYPE[sample.type]) throw new Error(`Unsupported health type: ${sample?.type}`);
  if (!Number.isFinite(Date.parse(sample.startTime))) throw new Error("Invalid health sample startTime.");
  if (sample.endTime && !Number.isFinite(Date.parse(sample.endTime))) throw new Error("Invalid health sample endTime.");
  if (typeof sample.unit !== "string" || !sample.unit.trim()) throw new Error("Health sample unit is required.");
  if (sample.type === "blood_pressure") {
    const v = sample.value as { systolic?: number; diastolic?: number };
    validateFinite(v?.systolic, "systolic");
    validateFinite(v?.diastolic, "diastolic");
  } else if (sample.type === "sleep") {
    validateFinite((sample.value as { minutes?: number })?.minutes, "minutes");
  } else {
    validateFinite(sample.value, "value");
  }
}

function sampleFingerprint(deviceId: string, sample: HealthSample, key: Buffer) {
  return createHmac("sha256", key)
    .update(JSON.stringify([deviceId, sample.type, sample.startTime, sample.endTime || "", sample.value, sample.unit, sample.source || ""]))
    .digest("base64url");
}

function encryptSample(deviceId: string, sample: HealthSample, key: Buffer): VaultEnvelope {
  const createdAt = new Date().toISOString();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${deviceId}:${createdAt}`, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(sample), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: 1,
    deviceId,
    createdAt,
    fingerprint: sampleFingerprint(deviceId, sample, key),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptEnvelope(envelope: VaultEnvelope, key: Buffer): HealthSample {
  if (envelope.v !== 1) throw new Error("Unsupported Health Vault envelope version.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(`${envelope.deviceId}:${envelope.createdAt}`, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const sample = JSON.parse(plaintext) as HealthSample;
  validateSample(sample);
  return sample;
}

export async function ingestHealthSamples(deviceId: string, samples: HealthSample[]) {
  const key = keyBytes();
  if (!key) throw new Error("Health Vault is locked. Set JARVIS_HEALTH_VAULT_KEY before health ingestion.");
  if (!Array.isArray(samples) || samples.length === 0) return { accepted: 0, duplicates: 0 };
  if (samples.length > 500) throw new Error("Health ingest batch is limited to 500 samples.");

  for (const sample of samples) validateSample(sample);
  const types = [...new Set(samples.map((sample) => sample.type))];
  for (const type of types) {
    const capability = CAPABILITY_BY_TYPE[type];
    if (!(await hasCapabilityGrant(deviceId, capability))) throw new Error(`Permission Broker denied ${capability} for ${deviceId}.`);
  }

  const target = vaultFile();
  const existing = new Set<string>();
  try {
    for (const line of (await fs.readFile(target, "utf8")).split(/\r?\n/).filter(Boolean)) {
      try {
        const envelope = JSON.parse(line) as Partial<VaultEnvelope>;
        if (typeof envelope.fingerprint === "string") existing.add(envelope.fingerprint);
      } catch { /* Ignore malformed legacy lines; decrypt path still rejects them. */ }
    }
  } catch { /* First ingest. */ }

  let duplicates = 0;
  const envelopes: VaultEnvelope[] = [];
  for (const sample of samples) {
    const fingerprint = sampleFingerprint(deviceId, sample, key);
    if (existing.has(fingerprint)) { duplicates += 1; continue; }
    existing.add(fingerprint);
    envelopes.push(encryptSample(deviceId, sample, key));
  }

  if (envelopes.length) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.appendFile(target, envelopes.map((envelope) => JSON.stringify(envelope)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  }
  return { accepted: envelopes.length, duplicates };
}

export async function latestHealthSamples(input: { deviceId?: string; types?: HealthType[]; limit?: number }) {
  const key = keyBytes();
  if (!key) throw new Error("Health Vault is disabled.");
  let raw = "";
  try { raw = await fs.readFile(vaultFile(), "utf8"); } catch { return []; }
  const types = input.types?.length ? new Set(input.types) : null;
  const limit = Math.max(1, Math.min(input.limit ?? 30, 200));
  const rows = raw.split(/\r?\n/).filter(Boolean).slice(-5000).reverse();
  const output: Array<HealthSample & { deviceId: string; ingestedAt: string }> = [];

  for (const row of rows) {
    if (output.length >= limit) break;
    let envelope: VaultEnvelope;
    try { envelope = JSON.parse(row) as VaultEnvelope; } catch { continue; }
    if (input.deviceId && envelope.deviceId !== input.deviceId) continue;
    try {
      const sample = decryptEnvelope(envelope, key);
      if (types && !types.has(sample.type)) continue;
      output.push({ ...sample, deviceId: envelope.deviceId, ingestedAt: envelope.createdAt });
    } catch {
      // Corrupt rows are ignored here but remain visible in the audit/file for forensic review.
    }
  }
  return output;
}
