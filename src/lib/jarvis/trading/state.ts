import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "../config";

type TradingState = { armedUntil?: string; mode: "off"|"paper"|"live"; day?: string; startEquity?: number; realizedPnl?: number; ordersToday?: number };
async function read():Promise<TradingState>{try{return JSON.parse(await fs.readFile(jarvisConfig.tradingStatePath,"utf8"));}catch{return {mode:"off"};}}
async function write(s:TradingState){await fs.mkdir(path.dirname(path.resolve(jarvisConfig.tradingStatePath)),{recursive:true});await fs.writeFile(jarvisConfig.tradingStatePath,JSON.stringify(s,null,2));}
export async function armTrading(mode:"paper"|"live",minutes:number){const s=await read();s.mode=mode;s.armedUntil=new Date(Date.now()+Math.max(1,Math.min(minutes,1440))*60000).toISOString();await write(s);return s;}
export async function disarmTrading(){const s=await read();s.mode="off";delete s.armedUntil;await write(s);return s;}
export async function tradingPermit(required:"paper"|"live"){const s=await read();const active=!!s.armedUntil&&Date.parse(s.armedUntil)>Date.now();return {state:s,allowed:active&&(s.mode===required||(required==="paper"&&s.mode==="live"))};}
