import fs from "node:fs/promises";import path from "node:path";import { randomUUID } from "node:crypto";
const p=()=>path.resolve(process.env.JARVIS_TRACE_PATH||"./data/traces.jsonl");
export async function traceEvent(event:{runId?:string;agent?:string;kind:string;tool?:string;status?:string;durationMs?:number;meta?:Record<string,unknown>}){const row={id:`trace_${randomUUID()}`,time:new Date().toISOString(),...event};await fs.mkdir(path.dirname(p()),{recursive:true});await fs.appendFile(p(),JSON.stringify(row)+"\n","utf8");return row;}
export async function recentTraces(limit=100){try{const lines=(await fs.readFile(p(),"utf8")).trim().split(/\r?\n/).filter(Boolean);return lines.slice(-Math.max(1,Math.min(limit,1000))).reverse().map((x:string)=>JSON.parse(x));}catch{return[];}}
