import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REACH_CHANNELS } from "./channels";
import type { ReachProbe } from "./types";
import { jarvisConfig } from "../config";
const execFileAsync = promisify(execFile);

async function probeCommand(command: string, args: string[] = ["--version"]) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 8000, windowsHide:true, maxBuffer:512_000 });
    return { ok:true, detail:(stdout || stderr || "ok").trim().slice(0,500) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "probe failed";
    return { ok:false, detail:msg.replace(/(token|secret|cookie|password)=\S+/gi,"$1=[REDACTED]").slice(0,500) };
  }
}

export async function reachDoctor(): Promise<ReachProbe[]> {
  const out: ReachProbe[] = [];
  for (const channel of REACH_CHANNELS) {
    const attempted: ReachProbe["attempted"] = [];
    let active: string | null = null;
    for (const backend of channel.backends) {
      if (!backend.command) { attempted.push({backend:backend.id,status:"builtin"}); active ??= backend.id; continue; }
      const p = await probeCommand(backend.command, backend.versionArgs);
      attempted.push({backend:backend.id,status:p.ok?"ok":"unavailable",detail:p.detail});
      if (p.ok && !active) active = backend.id;
    }
    out.push({ channel:channel.name, status:active?"ok":channel.tier===0?"warn":"off", activeBackend:active, attempted });
  }
  return out;
}

export async function agentReachDoctor() {
  const bin = jarvisConfig.agentReachBin;
  try {
    const { stdout, stderr } = await execFileAsync(bin,["doctor","--json"],{timeout:30_000,windowsHide:true,maxBuffer:2_000_000});
    const raw=(stdout||stderr||"").trim();
    try { return {installed:true, data:JSON.parse(raw)}; } catch { return {installed:true, raw:raw.slice(0,100_000)}; }
  } catch (e) { return {installed:false,error:e instanceof Error?e.message:"Agent-Reach doctor failed"}; }
}
