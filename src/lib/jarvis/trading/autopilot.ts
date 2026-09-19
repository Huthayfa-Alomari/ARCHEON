import { getHypothesis } from "../research/store";
import { mt5Bars, mt5Order } from "./mt5";
import { strategySignal } from "./signal";

function protectiveLevels(price:number,side:"buy"|"sell",slPct?:number,tpPct?:number){
  const sl=slPct&&slPct>0?price*(1+(side==="buy"?-1:1)*slPct/100):undefined;
  const tp=tpPct&&tpPct>0?price*(1+(side==="buy"?1:-1)*tpPct/100):undefined;
  return{sl,tp};
}

export async function autopilotStep(args:{hypothesisId:string;mode:"paper"|"shadow"|"live";symbol:string;timeframe?:string;volume?:number;bars?:number}){
  const h=await getHypothesis(args.hypothesisId);if(!h)throw new Error("Hypothesis not found.");
  if(args.mode==="paper"&&!(["paper","shadow","promoted"] as string[]).includes(h.status))throw new Error(`Hypothesis status ${h.status} is not eligible for paper execution.`);
  if(args.mode==="shadow"&&!(["shadow","promoted"] as string[]).includes(h.status))throw new Error(`Hypothesis status ${h.status} is not eligible for shadow execution.`);
  if(args.mode==="live"&&h.status!=="promoted")throw new Error("Live execution is allowed only for a promoted hypothesis.");
  const raw=await mt5Bars(args.symbol,args.timeframe||h.strategy.timeframe||"M15",Math.max(120,Number(args.bars||300)));
  const bars=(raw.bars||[]) as Array<{time:number;open:number;high:number;low:number;close:number}>;
  if(bars.length<20)throw new Error("MT5 returned too few bars.");
  // Ignore the newest bar because it may still be forming.
  const sig=strategySignal(h.strategy,bars.slice(0,-1));
  if(sig.signal===0)return{executed:false,mode:args.mode,hypothesisId:h.id,status:h.status,signal:sig};
  const side: "buy"|"sell"=sig.signal>0?"buy":"sell";
  const levels=protectiveLevels(sig.price,side,h.strategy.stopLossPct,h.strategy.takeProfitPct);
  if(args.mode==="shadow")return{executed:false,shadow:true,mode:args.mode,hypothesisId:h.id,status:h.status,side,levels,signal:sig};
  if(args.mode==="live"&&!levels.sl)throw new Error("Promoted strategy still needs stopLossPct before live execution.");
  const order=await mt5Order({mode:args.mode, symbol:args.symbol, side, volume:Number(args.volume||0.01), sl:levels.sl, tp:levels.tp, comment:`JARVIS ${h.id.slice(0,12)}`});
  return{executed:true,mode:args.mode,hypothesisId:h.id,status:h.status,side,levels,signal:sig,order};
}
