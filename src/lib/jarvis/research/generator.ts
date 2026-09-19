import type { StrategyKind, StrategySpec } from "./types";
import { createHypothesis, getHypothesis } from "./store";

const templates: Array<{ kind: StrategyKind; params: Record<string, number>; claim: string }> = [
  { kind: "sma-cross", params: { fast: 9, slow: 21 }, claim: "Short/long moving-average crossovers retain positive expectancy after costs in persistent trends." },
  { kind: "rsi-reversion", params: { period: 14, oversold: 28, overbought: 72 }, claim: "Extreme RSI excursions mean-revert when volatility is not expanding." },
  { kind: "donchian-breakout", params: { lookback: 20 }, claim: "Closing breakouts beyond recent range extremes persist sufficiently to overcome trading costs." },
  { kind: "bollinger-reversion", params: { period: 20, dev: 2 }, claim: "Price excursions outside a Bollinger envelope revert toward the rolling mean in range regimes." },
  { kind: "ema-trend-pullback", params: { fast: 20, slow: 50, pullbackPct: 0.2 }, claim: "Pullbacks toward the fast EMA inside an established EMA trend provide asymmetric continuation entries." },
  { kind: "atr-breakout", params: { period: 14, multiple: 1.5, lookback: 20 }, claim: "Range breakouts accompanied by ATR expansion have stronger continuation than unfiltered breakouts." },
  { kind: "range-fade", params: { lookback: 30, edgePct: 0.12 }, claim: "Repeated tests of bounded range edges revert when the range width is stable." },
  { kind: "ict-smc", params: { swingWindow: 3, liquidityLookback: 20, equalToleranceAtr: 0.12, displacementAtr: 1.2, confirmBars: 4, minScore: 1.4 }, claim: "Liquidity sweeps followed by market-structure shift, displacement and imbalance confluence have measurable out-of-sample continuation or reversal expectancy after costs." },
];

function seeded(seed: string, n: number) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= n * 2654435761;
  return (h >>> 0) / 4294967295;
}

function mutateNumber(v: number, r: number, magnitude = 0.25) {
  const factor = 1 + (r * 2 - 1) * magnitude;
  return Math.max(0.0001, Number((v * factor).toFixed(4)));
}

function mutateSpec(base: StrategySpec, seed: string, i: number): StrategySpec {
  const params: Record<string, number> = {};
  let j = 0;
  for (const [k, v] of Object.entries(base.params)) params[k] = mutateNumber(v, seeded(seed, i * 17 + j++));
  if (params.fast && params.slow && params.fast >= params.slow) params.slow = Math.ceil(params.fast + Math.max(2, params.fast * 0.5));
  if (params.overbought) params.overbought = Math.max(55, Math.min(90, params.overbought));
  if (params.oversold) params.oversold = Math.max(10, Math.min(45, params.oversold));
  return { ...base, params };
}

export async function generateCandidateBatch(args: { seed?: string; count?: number; timeframe?: string; sourceRefs?: string[]; tags?: string[] }) {
  const seed = (args.seed || "market-structure").slice(0, 200);
  const count = Math.max(1, Math.min(Number(args.count || 8), 40));
  const rows = [];
  for (let i = 0; i < count; i++) {
    const t = templates[i % templates.length];
    const spec = mutateSpec({ kind: t.kind, params: t.params, timeframe: args.timeframe || "M15", direction: "both" }, seed, i);
    rows.push(await createHypothesis({
      title: `${t.kind} candidate G0-${i + 1}`,
      claim: t.claim,
      rationale: `Programmatically generated candidate from seed '${seed}'. It is a falsifiable research object, not a trading recommendation.`,
      sourceRefs: args.sourceRefs || [],
      tags: ["auto-generated", "quant-research", ...(args.tags || [])],
      strategy: spec,
      generation: 0,
      evidenceScore: args.sourceRefs?.length ? 0.6 : 0.35,
    }));
  }
  return { seed, generatedAt: new Date().toISOString(), candidates: rows };
}

export async function mutateHypothesis(args: { hypothesisId: string; count?: number; seed?: string }) {
  const parent = await getHypothesis(args.hypothesisId);
  if (!parent) throw new Error("Hypothesis not found.");
  const count = Math.max(1, Math.min(Number(args.count || 6), 30));
  const generation = (parent.generation || 0) + 1;
  const seed = args.seed || `${parent.id}:${generation}`;
  const rows = [];
  for (let i = 0; i < count; i++) {
    const strategy = mutateSpec(parent.strategy, seed, i);
    rows.push(await createHypothesis({
      title: `${parent.title} · mutation G${generation}-${i + 1}`,
      claim: parent.claim,
      rationale: `Parameter mutation of ${parent.id}. Child must independently pass out-of-sample, walk-forward, bootstrap and cost-stress gates.`,
      sourceRefs: parent.sourceRefs,
      tags: [...parent.tags.filter((x) => x !== "auto-generated"), "evolved"],
      strategy,
      parentHypothesisId: parent.id,
      generation,
      evidenceScore: parent.evidenceScore,
    }));
  }
  return rows;
}
