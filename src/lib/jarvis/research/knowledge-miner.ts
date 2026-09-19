import { searchKnowledge } from "../knowledge-store";
import { createHypothesis } from "./store";
import type { StrategyKind, StrategySpec } from "./types";

type Family = { kind: StrategyKind; terms: RegExp; params: Record<string, number>; claim: string };
const families: Family[] = [
  { kind:"sma-cross", terms:/moving average|ma cross|trend following|trend[- ]following|momentum/i, params:{fast:9,slow:21}, claim:"Trend-following crossover behavior described in the retrieved evidence persists out of sample after realistic costs." },
  { kind:"ema-trend-pullback", terms:/pullback|retracement|ema|continuation/i, params:{fast:20,slow:50,pullbackPct:.2}, claim:"Trend pullbacks described in the retrieved evidence produce continuation entries with positive out-of-sample expectancy." },
  { kind:"rsi-reversion", terms:/rsi|oversold|overbought|mean reversion|mean-reversion/i, params:{period:14,oversold:30,overbought:70}, claim:"Oscillator extremes described in the retrieved evidence mean-revert strongly enough to survive costs." },
  { kind:"bollinger-reversion", terms:/bollinger|standard deviation|deviation band|z-score/i, params:{period:20,dev:2}, claim:"Statistical envelope excursions described in the retrieved evidence revert toward the mean out of sample." },
  { kind:"donchian-breakout", terms:/breakout|channel breakout|donchian|range break/i, params:{lookback:20}, claim:"Price breakouts described in the retrieved evidence retain continuation expectancy out of sample." },
  { kind:"atr-breakout", terms:/atr|average true range|volatility expansion|range expansion/i, params:{period:14,multiple:1.5,lookback:20}, claim:"Volatility expansion filters improve breakout quality versus unfiltered range breaks." },
  { kind:"range-fade", terms:/range bound|range-bound|support resistance|support\/resistance|fade/i, params:{lookback:30,edgePct:.12}, claim:"Stable range-edge fades described in the retrieved evidence retain positive expectancy after costs." },
];

export async function mineKnowledgeForHypotheses(args:{query:string;limit?:number;maxHypotheses?:number;timeframe?:string}){
  const query=String(args.query||"").trim(); if(!query)throw new Error("query is required.");
  const chunks=await searchKnowledge(query,Math.max(3,Math.min(Number(args.limit||12),40)));
  if(!chunks.length)return{query,chunks:0,created:[],message:"No matching Knowledge Fabric evidence."};
  const hay=chunks.map(c=>`${c.title}\n${c.content}`).join("\n");
  const refs=[...new Set(chunks.map(c=>c.sourceRef))].slice(0,20);
  const matched=families.filter(f=>f.terms.test(hay));
  const fallback=matched.length?matched:[families[0],families[2],families[4]];
  const max=Math.max(1,Math.min(Number(args.maxHypotheses||8),20));
  const created=[];
  for(const f of fallback.slice(0,max)){
    const relevant=chunks.filter(c=>f.terms.test(`${c.title} ${c.content}`)).slice(0,5);
    const sourceRefs=(relevant.length?relevant:chunks.slice(0,3)).map(c=>c.sourceRef);
    const avgTrust=(relevant.length?relevant:chunks.slice(0,3)).reduce((a,c)=>a+c.trust,0)/Math.max(1,(relevant.length?relevant:chunks.slice(0,3)).length);
    const strategy:StrategySpec={kind:f.kind,timeframe:args.timeframe||"M15",params:f.params,direction:"both"};
    created.push(await createHypothesis({
      title:`Evidence-mined ${f.kind}: ${query}`,
      claim:f.claim,
      rationale:`Generated from Knowledge Fabric retrieval for '${query}'. Source text is evidence, not authority; the candidate must pass independent statistical validation before any lifecycle promotion.`,
      sourceRefs,
      tags:["knowledge-mined","quant-research",f.kind],
      strategy,
      evidenceScore:Math.max(0,Math.min(1,avgTrust)),
    }));
  }
  return{query,chunks:chunks.length,sourceRefs:refs,created};
}
