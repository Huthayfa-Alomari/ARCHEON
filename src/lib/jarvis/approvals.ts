import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";
import type { PendingApproval, ToolCall } from "./types";

function approvalsFile() {
  return path.resolve(process.cwd(), jarvisConfig.approvalsPath);
}

async function readAll(): Promise<PendingApproval[]> {
  try {
    const raw = await fs.readFile(approvalsFile(), "utf8");
    const parsed = JSON.parse(raw) as { approvals?: PendingApproval[] };
    const now = Date.now();
    return (parsed.approvals || []).filter((item) => Date.parse(item.expiresAt) > now);
  } catch {
    return [];
  }
}

async function writeAll(approvals: PendingApproval[]) {
  const target = approvalsFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify({ approvals }, null, 2), "utf8");
}

export async function listPendingApprovals() { return readAll(); }

export async function createApproval(toolCall: ToolCall, userMessage: string, preview?: string) {
  const approvals = await readAll();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + jarvisConfig.approvalTtlMinutes * 60_000);
  const approval: PendingApproval = {
    id: randomUUID(),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    toolCall,
    userMessage,
    preview,
  };
  approvals.push(approval);
  await writeAll(approvals);
  return approval;
}

export async function takeApproval(id: string): Promise<PendingApproval | null> {
  const approvals = await readAll();
  const index = approvals.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [approval] = approvals.splice(index, 1);
  await writeAll(approvals);
  return approval;
}

export async function rejectApproval(id: string): Promise<boolean> {
  const approvals = await readAll();
  const filtered = approvals.filter((item) => item.id !== id);
  const changed = filtered.length !== approvals.length;
  if (changed) await writeAll(filtered);
  return changed;
}
