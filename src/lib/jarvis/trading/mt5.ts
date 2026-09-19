import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { jarvisConfig } from "../config";
import { tradingPermit } from "./state";
const execFileAsync=promisify(execFile);

async function bridge(payload:Record<string,unknown>){
  const script=path.resolve(jarvisConfig.mt5BridgePath); const {stdout}=await execFileAsync(jarvisConfig.pythonBin,[script,JSON.stringify(payload)],{timeout:30000,maxBuffer:2_000_000});
  const line=stdout.trim().split(/\r?\n/).at(-1)||"{}"; const out=JSON.parse(line); if(!out.ok)throw new Error(out.error||"MT5 bridge failed"); return out;
}
export const mt5Status=()=>bridge({action:"status"});
export const mt5Bars=(symbol:string,timeframe:string,count:number)=>bridge({action:"bars",symbol,timeframe,count:Math.min(Math.max(count,10),5000)});
export const mt5Positions=()=>bridge({action:"positions"});
export async function mt5Order(args:{mode:"paper"|"live";symbol:string;side:"buy"|"sell";volume:number;sl?:number;tp?:number;deviation?:number;comment?:string}){
  const p=await tradingPermit(args.mode); if(!p.allowed)throw new Error(`${args.mode} trading is not armed or the permit expired.`);
  if(!jarvisConfig.tradingSymbols.includes(args.symbol.toUpperCase()))throw new Error("Symbol is not in JARVIS_TRADING_SYMBOLS allowlist.");
  if(!(args.volume>0&&args.volume<=jarvisConfig.maxTradeVolume))throw new Error(`Volume exceeds limit ${jarvisConfig.maxTradeVolume}.`);
  return bridge({action:"order",...args,magic:jarvisConfig.mt5Magic,maxRiskPct:jarvisConfig.maxRiskPerTradePct,maxDailyLossPct:jarvisConfig.maxDailyLossPct});
}
