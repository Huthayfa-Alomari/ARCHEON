import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "../config";

type Bar={time:string;open:number;high:number;low:number;close:number};
type RegimeSegment={from:string;to:string;bars:number;annualizedVol:number;netReturnPct:number;trendEfficiency:number;regime:string};
function parts(l:string){return l.split(",").map((x:string)=>x.trim().replace(/^"|"$/g,""));}
async function barsFromCsv(relative:string):Promise<Bar[]>{
  const root=path.resolve(jarvisConfig.workspacePath), file=path.resolve(root,relative);
  if(!(file===root||file.startsWith(root+path.sep)))throw new Error("CSV must be inside workspace.");
  const lines:string[]=(await fs.readFile(file,"utf8")).split(/\r?\n/).filter(Boolean);
  const h=parts(lines[0]).map((x:string)=>x.toLowerCase()); const ix=(n:string)=>h.indexOf(n);
  const ti=[ix("time"),ix("timestamp"),ix("datetime"),ix("date")].find((i:number)=>i>=0)??-1;
  const oi=ix("open"),hi=ix("high"),li=ix("low"),ci=ix("close"); if([oi,hi,li,ci].some((i:number)=>i<0))throw new Error("CSV needs open, high, low, close columns.");
  return lines.slice(1).map((l:string,i:number)=>{const p=parts(l);return{time:ti>=0?p[ti]:String(i),open:+p[oi],high:+p[hi],low:+p[li],close:+p[ci]};}).filter((b:Bar)=>[b.open,b.high,b.low,b.close].every(Number.isFinite));
}
function mean(xs:number[]){return xs.length?xs.reduce((a:number,b:number)=>a+b,0)/xs.length:0;}
function stdev(xs:number[]){const m=mean(xs);return Math.sqrt(mean(xs.map((x:number)=>(x-m)**2)));}
export async function analyzeRegimes(args:{csvPath:string;window?:number}){
  const bars=await barsFromCsv(args.csvPath);const w=Math.max(20,Math.min(Number(args.window||100),500));const chunks:RegimeSegment[]=[];
  for(let i=w;i<bars.length;i+=w){const x=bars.slice(i-w,i), rets=x.slice(1).map((b:Bar,j:number)=>Math.log(b.close/x[j].close)), vol=stdev(rets)*Math.sqrt(252), net=(x.at(-1)!.close-x[0].close)/x[0].close, pathLen=x.slice(1).reduce((s:number,b:Bar,j:number)=>s+Math.abs((b.close-x[j].close)/x[j].close),0), efficiency=pathLen?Math.abs(net)/pathLen:0;let regime="range";if(vol>.45)regime="high-volatility";else if(efficiency>.35&&net>.02)regime="uptrend";else if(efficiency>.35&&net<-.02)regime="downtrend";else if(vol<.12)regime="quiet-range";chunks.push({from:x[0].time,to:x.at(-1)!.time,bars:x.length,annualizedVol:Number(vol.toFixed(4)),netReturnPct:Number((net*100).toFixed(3)),trendEfficiency:Number(efficiency.toFixed(3)),regime});}
  const counts=Object.fromEntries([...new Set(chunks.map((x:RegimeSegment)=>x.regime))].map((r:string)=>[r,chunks.filter((x:RegimeSegment)=>x.regime===r).length]));return{csvPath:args.csvPath,window:w,segments:chunks.length,counts,chunks};
}
