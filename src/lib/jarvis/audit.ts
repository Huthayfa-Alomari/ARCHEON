import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "./config";

export type AuditEvent = {
  at: string;
  event: string;
  tool?: string;
  approvalId?: string;
  ok?: boolean;
  detail?: string;
};

function auditFile() {
  return path.resolve(process.cwd(), jarvisConfig.auditPath);
}

export async function audit(event: Omit<AuditEvent, "at">) {
  try {
    const target = auditFile();
    await fs.mkdir(path.dirname(target), { recursive: true });
    const row: AuditEvent = { at: new Date().toISOString(), ...event };
    await fs.appendFile(target, `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    // Audit failures must never crash JARVIS.
  }
}

export async function recentAudit(limit = 30): Promise<AuditEvent[]> {
  try {
    const raw = await fs.readFile(auditFile(), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(limit, 100)))
      .reverse()
      .map((line) => JSON.parse(line) as AuditEvent);
  } catch {
    return [];
  }
}
