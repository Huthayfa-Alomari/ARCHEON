import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jarvisConfig } from "../config";
import { addExperiment, getHypothesis } from "./store";
import type { BacktestMetrics, ResearchExperiment, StrategySpec, ValidationMetrics } from "./types";
import { ictSmcSignal } from "../trading/ict-smc";

type Bar = { time: string; open: number; high: number; low: number; close: number };
type Trade = { ret: number; entry: number; exit: number; bars: number };

function csvParts(line: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out.map((x) => x.trim().replace(/^"|"$/g, ""));
}

async function loadBars(relative: string): Promise<Bar[]> {
  const root = path.resolve(jarvisConfig.workspacePath);
  const file = path.resolve(root, relative);
  if (!(file === root || file.startsWith(root + path.sep))) throw new Error("CSV must be inside JARVIS_WORKSPACE_PATH.");
  const text = await fs.readFile(file, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 100) throw new Error("At least 100 OHLC rows are required.");
  const header = csvParts(lines[0]).map((x) => x.toLowerCase());
  const idx = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const ti = idx(["time","timestamp","date","datetime"]), oi = idx(["open"]), hi = idx(["high"]), li = idx(["low"]), ci = idx(["close"]);
  if ([oi, hi, li, ci].some((i) => i < 0)) throw new Error("CSV needs open, high, low, close columns.");
  return lines.slice(1).map((line, i) => { const p = csvParts(line); return { time: ti >= 0 ? p[ti] : String(i), open:+p[oi], high:+p[hi], low:+p[li], close:+p[ci] }; }).filter((b) => [b.open,b.high,b.low,b.close].every(Number.isFinite));
}

function sma(xs: number[], end: number, n: number) { if (end + 1 < n) return NaN; let s=0; for(let i=end-n+1;i<=end;i++) s+=xs[i]; return s/n; }
function std(xs:number[], end:number,n:number){ const m=sma(xs,end,n); if(!Number.isFinite(m)) return NaN; let s=0; for(let i=end-n+1;i<=end;i++) s+=(xs[i]-m)**2; return Math.sqrt(s/n); }
function rsi(xs:number[], end:number,n:number){ if(end<n) return NaN; let g=0,l=0; for(let i=end-n+1;i<=end;i++){const d=xs[i]-xs[i-1]; if(d>=0)g+=d; else l-=d;} if(l===0)return 100; const rs=(g/n)/(l/n); return 100-100/(1+rs); }
function donchian(bars:Bar[], end:number,n:number){ if(end<n)return null; let h=-Infinity,l=Infinity; for(let i=end-n;i<end;i++){h=Math.max(h,bars[i].high);l=Math.min(l,bars[i].low);} return {h,l}; }

function signal(spec: StrategySpec, bars: Bar[], i: number): -1|0|1 {
  const c=bars.map(b=>b.close); const p=spec.params; const allow=spec.direction||"both"; let s: -1|0|1=0;
  if(spec.kind==="sma-cross"){
    const f=Math.max(2,Math.round(p.fast||9)), slow=Math.max(f+1,Math.round(p.slow||21)); if(i<slow+1)return 0;
    const a=sma(c,i-1,f), b=sma(c,i-1,slow), ap=sma(c,i-2,f), bp=sma(c,i-2,slow);
    if(ap<=bp&&a>b)s=1; else if(ap>=bp&&a<b)s=-1;
  } else if(spec.kind==="rsi-reversion"){
    const v=rsi(c,i-1,Math.max(2,Math.round(p.period||14))); if(v<(p.oversold||30))s=1; else if(v>(p.overbought||70))s=-1;
  } else if(spec.kind==="donchian-breakout"){
    const d=donchian(bars,i-1,Math.max(2,Math.round(p.lookback||20))); if(!d)return 0; if(bars[i-1].close>d.h)s=1; else if(bars[i-1].close<d.l)s=-1;
  } else if(spec.kind==="bollinger-reversion"){
    const n=Math.max(2,Math.round(p.period||20)), k=p.dev||2; const m=sma(c,i-1,n), sd=std(c,i-1,n); if(!Number.isFinite(m)||!Number.isFinite(sd))return 0; if(c[i-1]<m-k*sd)s=1; else if(c[i-1]>m+k*sd)s=-1;
  } else if(spec.kind==="ema-trend-pullback"){
    const fast=Math.max(2,Math.round(p.fast||20)), slow=Math.max(fast+2,Math.round(p.slow||50)); if(i<slow+2)return 0;
    const ef=sma(c,i-1,fast), es=sma(c,i-1,slow), prev=c[i-2], now=c[i-1], tol=Math.max(0.0001,(p.pullbackPct||0.2)/100);
    if(ef>es && prev<=ef*(1+tol) && now>ef)s=1; else if(ef<es && prev>=ef*(1-tol) && now<ef)s=-1;
  } else if(spec.kind==="atr-breakout"){
    const n=Math.max(3,Math.round(p.period||14)), look=Math.max(5,Math.round(p.lookback||20)), mult=Math.max(.2,p.multiple||1.5); if(i<Math.max(n,look)+2)return 0;
    let atr=0; for(let j=i-n;j<i;j++){const pc=bars[j-1]?.close??bars[j].open; atr+=Math.max(bars[j].high-bars[j].low,Math.abs(bars[j].high-pc),Math.abs(bars[j].low-pc));} atr/=n;
    const d=donchian(bars,i-1,look); if(!d)return 0; const width=d.h-d.l; if(atr*mult < width/look)return 0;
    if(c[i-1]>d.h)s=1; else if(c[i-1]<d.l)s=-1;
  } else if(spec.kind==="range-fade"){
    const look=Math.max(5,Math.round(p.lookback||30)), edge=Math.max(.01,(p.edgePct||0.12)/100); const d=donchian(bars,i-1,look); if(!d)return 0;
    const w=d.h-d.l; if(w<=0)return 0; if(c[i-1]>=d.h-w*edge)s=-1; else if(c[i-1]<=d.l+w*edge)s=1;
  } else if(spec.kind==="ict-smc"){
    s=ictSmcSignal(spec,bars.slice(0,i)).signal;
  } else if(spec.kind==="hybrid-vote"){
    const components=(spec.components||[]).slice(0,8);
    if(!components.length)return 0;
    const votes=components.map((component)=>signal(component,bars,i));
    const score=votes.reduce<number>((a,b)=>a+b,0);
    const threshold=Math.max(1,Math.min(components.length,Math.round(spec.voteThreshold||Math.ceil(components.length/2))));
    if(score>=threshold)s=1; else if(score<=-threshold)s=-1;
  }
  if(allow==="long"&&s<0)return 0; if(allow==="short"&&s>0)return 0; return s;
}

function run(spec:StrategySpec,bars:Bar[],costBps:number):{metrics:BacktestMetrics;trades:Trade[]}{
  const trades:Trade[]=[]; let pos: -1|0|1=0, entry=0, entryI=0; let inMarket=0;
  for(let i=2;i<bars.length;i++){
    if(pos!==0){ inMarket++; const px=bars[i].open; const raw=(px-entry)/entry*pos; const sl=spec.stopLossPct? -Math.abs(spec.stopLossPct)/100: -Infinity; const tp=spec.takeProfitPct? Math.abs(spec.takeProfitPct)/100: Infinity; const sig=signal(spec,bars,i); if(raw<=sl||raw>=tp||sig===-pos){ const ret=raw-costBps/10000; trades.push({ret,entry,exit:px,bars:i-entryI}); pos=0; }}
    if(pos===0){ const s=signal(spec,bars,i); if(s!==0){pos=s;entry=bars[i].open;entryI=i;} }
  }
  if(pos!==0){const px=bars.at(-1)!.close; trades.push({ret:(px-entry)/entry*pos-costBps/10000,entry,exit:px,bars:bars.length-1-entryI});}
  const rs=trades.map(t=>t.ret), wins=rs.filter(r=>r>0), losses=rs.filter(r=>r<0); const grossW=wins.reduce((a,b)=>a+b,0), grossL=-losses.reduce((a,b)=>a+b,0);
  let eq=1,peak=1,maxDd=0; for(const r of rs){eq*=1+r;peak=Math.max(peak,eq);maxDd=Math.max(maxDd,(peak-eq)/peak);}
  const mean=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:0; const sd=rs.length>1?Math.sqrt(rs.reduce((a,b)=>a+(b-mean)**2,0)/(rs.length-1)):0; const downs=rs.filter(r=>r<0); const dsd=downs.length?Math.sqrt(downs.reduce((a,b)=>a+b*b,0)/downs.length):0;
  const years=Math.max(1/365,(Date.parse(bars.at(-1)!.time)-Date.parse(bars[0].time))/31557600000); const ann=Number.isFinite(years)&&years>0?Math.pow(eq,1/years)-1:eq-1;
  return {trades,metrics:{bars:bars.length,trades:rs.length,winRate:rs.length?wins.length/rs.length:0,profitFactor:grossL>0?grossW/grossL:(grossW>0?99:0),expectancyPct:mean*100,totalReturnPct:(eq-1)*100,annualizedReturnPct:ann*100,sharpe:sd?mean/sd*Math.sqrt(Math.max(1,rs.length)):0,sortino:dsd?mean/dsd*Math.sqrt(Math.max(1,rs.length)):0,maxDrawdownPct:maxDd*100,exposurePct:inMarket/Math.max(1,bars.length)*100,avgTradePct:mean*100}};
}

function percentile(xs:number[],p:number){const a=[...xs].sort((x,y)=>x-y); if(!a.length)return 0; return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))];}
function seed32(text:string){let h=2166136261>>>0;for(let i=0;i<text.length;i++){h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;}return h||1;}
function rng32(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function bootstrap(trades:Trade[],rounds=600,seed="jarvis"){ if(!trades.length)return {prob:0,ci:[0,0] as [number,number]}; const totals:number[]=[]; const rand=rng32(seed32(seed)); for(let r=0;r<rounds;r++){let eq=1; for(let i=0;i<trades.length;i++)eq*=1+trades[Math.floor(rand()*trades.length)].ret; totals.push((eq-1)*100);} return {prob:totals.filter(x=>x>0).length/totals.length,ci:[percentile(totals,.025),percentile(totals,.975)] as [number,number]}; }

function perturbSpec(spec:StrategySpec,factor:number):StrategySpec{const params:Record<string,number>={};for(const[k,v]of Object.entries(spec.params)){let x=Math.max(.0001,v*factor);if(["fast","slow","period","lookback","swingWindow","liquidityLookback","confirmBars"].includes(k))x=Math.max(1,Math.round(x));params[k]=x;}if(params.fast&&params.slow&&params.fast>=params.slow)params.slow=Math.round(params.fast+2);return{...spec,params,components:spec.components?.map(c=>perturbSpec(c,factor))};}
function stability(spec:StrategySpec,bars:Bar[],cost:number){const factors=[.8,.9,1,1.1,1.2];const scores=factors.map(f=>run(perturbSpec(spec,f),bars,cost).metrics).filter(m=>m.trades>=5);if(!scores.length)return 0;const positive=scores.filter(m=>m.profitFactor>1&&m.totalReturnPct>0).length/scores.length;const dd=scores.reduce((a,m)=>a+Math.max(0,1-m.maxDrawdownPct/40),0)/scores.length;return Math.max(0,Math.min(1,positive*.7+dd*.3));}

export async function validateHypothesis(args:{hypothesisId:string;csvPath:string;symbol?:string;timeframe?:string;spreadBps?:number;commissionBps?:number;slippageBps?:number;seed?:string;}){
  const h=await getHypothesis(args.hypothesisId); if(!h)throw new Error("Hypothesis not found."); const bars=await loadBars(args.csvPath); const cut=Math.max(60,Math.floor(bars.length*.7)); const cost=(args.spreadBps||0)+(args.commissionBps||0)+(args.slippageBps||0);
  const train=run(h.strategy,bars.slice(0,cut),cost); const test=run(h.strategy,bars.slice(cut),cost);
  const folds:number[]=[]; const foldSize=Math.max(50,Math.floor(bars.length/6)); for(let start=0;start+foldSize<=bars.length;start+=foldSize){const m=run(h.strategy,bars.slice(start,start+foldSize),cost).metrics; if(m.trades>=3)folds.push(m.totalReturnPct);}
  const reproducibilitySeed=args.seed || `${args.hypothesisId}|${args.csvPath}|${args.symbol||""}|${args.timeframe||""}|${cost}`;
  const bs=bootstrap(test.trades,600,reproducibilitySeed); const positiveFoldRate=folds.length?folds.filter(x=>x>0).length/folds.length:0; const median=folds.length?percentile(folds,.5):0;
  const trainRet=train.metrics.totalReturnPct, testRet=test.metrics.totalReturnPct; const overfitGap=Math.abs(trainRet-testRet)/Math.max(1,Math.abs(trainRet));
  const stressMultipliers=[1,1.5,2,3]; const stress=stressMultipliers.map(x=>run(h.strategy,bars.slice(cut),cost*x).metrics); const costStressPassRate=stress.filter(m=>m.trades>=5&&m.profitFactor>=1&&m.totalReturnPct>=0).length/stress.length;
  const parameterStabilityScore=stability(h.strategy,bars.slice(cut),cost);
  const reasons:string[]=[]; if(test.metrics.trades<10)reasons.push("fewer than 10 out-of-sample trades"); if(test.metrics.profitFactor<1.1)reasons.push("out-of-sample profit factor < 1.10"); if(test.metrics.maxDrawdownPct>25)reasons.push("out-of-sample max drawdown > 25%"); if(bs.prob<.8)reasons.push("bootstrap probability of positive return < 80%"); if(positiveFoldRate<.6)reasons.push("positive walk-forward folds < 60%"); if(costStressPassRate<.5)reasons.push("fails majority of transaction-cost stress scenarios"); if(parameterStabilityScore<.5)reasons.push("parameter neighborhood is unstable"); if(overfitGap>1.5)reasons.push("train/test performance gap indicates probable overfit");
  const score=Math.max(0,Math.min(1,(Math.min(2,test.metrics.profitFactor)/2)*.18+Math.max(0,1-test.metrics.maxDrawdownPct/40)*.14+bs.prob*.2+positiveFoldRate*.16+costStressPassRate*.14+parameterStabilityScore*.18));
  const validation:ValidationMetrics={train:train.metrics,test:test.metrics,walkForwardMedianReturnPct:median,walkForwardPositiveFoldRate:positiveFoldRate,bootstrapPositiveProbability:bs.prob,bootstrapReturnCi95:bs.ci,robustnessScore:score,overfitGapPct:overfitGap*100,costStressPassRate,parameterStabilityScore,passes:reasons.length===0,reasons};
  const exp:ResearchExperiment={id:`exp_${randomUUID()}`,hypothesisId:h.id,createdAt:new Date().toISOString(),dataRef:args.csvPath,symbol:args.symbol,timeframe:args.timeframe,costs:{spreadBps:args.spreadBps||0,commissionBps:args.commissionBps||0,slippageBps:args.slippageBps||0},seed:reproducibilitySeed,validation,notes:["70/30 chronological train/test split","bounded walk-forward folds","seeded bootstrap resampling of out-of-sample trade returns"]};
  return addExperiment(exp);
}
