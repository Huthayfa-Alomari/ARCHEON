import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { jarvisConfig } from "./config";

const execFileAsync = promisify(execFile);

type BskResult = { ok: boolean; stdout: string; stderr: string; json?: unknown };

async function bsk(args: string[], timeoutMs = 20_000): Promise<BskResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, BSK_AUTO_START: "0" };
  if (jarvisConfig.browserSkillHome) env.BSK_HOME = jarvisConfig.browserSkillHome;
  try {
    const { stdout, stderr } = await execFileAsync(jarvisConfig.browserSkillBin, args, {
      timeout: timeoutMs,
      maxBuffer: 1_500_000,
      env,
      windowsHide: true,
    });
    const text = String(stdout || "").trim();
    let json: unknown;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* not every bsk command is JSON */ }
    return { ok: true, stdout: text, stderr: String(stderr || "").trim(), json };
  } catch (error) {
    const e = error as Error & { stdout?: string; stderr?: string };
    return { ok: false, stdout: String(e.stdout || "").trim(), stderr: String(e.stderr || e.message || "").trim() };
  }
}

function requireSession(sessionId: unknown) {
  const id = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!/^[A-Za-z0-9._:-]{4,160}$/.test(id)) throw new Error("A valid BrowserSkill sessionId is required.");
  return id;
}

function requireRef(ref: unknown) {
  const value = typeof ref === "string" ? ref.trim() : "";
  if (!/^@e\d+$/.test(value)) throw new Error("BrowserSkill ref must look like @e3 and come from a fresh observation.");
  return value;
}

export async function browserSkillStatus() { return bsk(["status", "--json"], 12_000); }

export async function browserSkillStart() {
  return bsk(["session", "start", "--json"], 20_000);
}

export async function browserSkillStop(sessionId: unknown) {
  return bsk(["session", "stop", requireSession(sessionId)], 15_000);
}

export async function browserSkillNavigate(sessionId: unknown, url: unknown) {
  const target = typeof url === "string" ? url.trim() : "";
  const parsed = new URL(target);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error("Browser navigation only supports http/https URLs.");
  return bsk(["navigate", target, "--session", requireSession(sessionId)], 30_000);
}

export async function browserSkillObserve(sessionId: unknown, maxTokens?: unknown) {
  const args = ["observe", "--session", requireSession(sessionId)];
  const n = Number(maxTokens);
  if (Number.isFinite(n)) args.push("--max-tokens", String(Math.max(500, Math.min(Math.trunc(n), 12_000))));
  return bsk(args, 25_000);
}

export async function browserSkillClick(sessionId: unknown, ref: unknown) {
  return bsk(["click", requireRef(ref), "--session", requireSession(sessionId)], 25_000);
}

export async function browserSkillFill(sessionId: unknown, ref: unknown, value: unknown) {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length > 20_000) throw new Error("Browser fill value is too large.");
  return bsk(["fill", requireRef(ref), "--value", text, "--session", requireSession(sessionId)], 25_000);
}


export async function browserSkillListUserTabs(sessionId: unknown) {
  return bsk(["tab", "list", "--scope", "user", "--session", requireSession(sessionId), "--json"], 20_000);
}

function requireTabId(tabId: unknown) {
  const value = typeof tabId === "number" ? String(Math.trunc(tabId)) : typeof tabId === "string" ? tabId.trim() : "";
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new Error("A valid BrowserSkill tabId is required.");
  return value;
}

export async function browserSkillBorrowTab(sessionId: unknown, tabId: unknown) {
  return bsk(["tab", "borrow", requireTabId(tabId), "--session", requireSession(sessionId)], 75_000);
}

export async function browserSkillReturnTab(sessionId: unknown, tabId: unknown) {
  return bsk(["tab", "return", requireTabId(tabId), "--session", requireSession(sessionId)], 30_000);
}
