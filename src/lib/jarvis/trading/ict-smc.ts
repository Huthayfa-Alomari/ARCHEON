import type { StrategySpec } from "../research/types";

export type MarketBar = { time?: string | number; open: number; high: number; low: number; close: number };
export type SmcFeature = {
  kind: "swing-high" | "swing-low" | "bos" | "choch" | "bullish-fvg" | "bearish-fvg" | "bullish-ob" | "bearish-ob" | "buy-side-sweep" | "sell-side-sweep" | "equal-highs" | "equal-lows" | "displacement";
  index: number; price?: number; direction?: "bullish" | "bearish"; score: number; note: string;
};

function atr(bars: MarketBar[], end: number, n = 14) {
  if (end < 1) return 0; const start = Math.max(1, end - n + 1); let total = 0, count = 0;
  for (let i = start; i <= end; i++) { const pc = bars[i - 1].close; total += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc)); count++; }
  return count ? total / count : 0;
}
function pivotHigh(bars: MarketBar[], i: number, w: number) { if (i < w || i + w >= bars.length) return false; for (let j = i - w; j <= i + w; j++) if (j !== i && bars[j].high >= bars[i].high) return false; return true; }
function pivotLow(bars: MarketBar[], i: number, w: number) { if (i < w || i + w >= bars.length) return false; for (let j = i - w; j <= i + w; j++) if (j !== i && bars[j].low <= bars[i].low) return false; return true; }

export function detectIctSmc(bars: MarketBar[], spec?: StrategySpec) {
  const p = spec?.params || {}; const swingWindow = Math.max(2, Math.round(p.swingWindow || 3)); const lookback = Math.max(10, Math.round(p.liquidityLookback || 20));
  const eqTolAtr = Math.max(0.02, p.equalToleranceAtr || 0.12); const displacementAtr = Math.max(0.5, p.displacementAtr || 1.2);
  const features: SmcFeature[] = []; const swingHighs: Array<{ i: number; price: number }> = []; const swingLows: Array<{ i: number; price: number }> = [];
  for (let i = swingWindow; i < bars.length - swingWindow; i++) {
    if (pivotHigh(bars, i, swingWindow)) { swingHighs.push({ i, price: bars[i].high }); features.push({ kind: "swing-high", index: i, price: bars[i].high, score: 0.2, note: "confirmed local swing high" }); }
    if (pivotLow(bars, i, swingWindow)) { swingLows.push({ i, price: bars[i].low }); features.push({ kind: "swing-low", index: i, price: bars[i].low, score: 0.2, note: "confirmed local swing low" }); }
  }
  let structure: "bullish" | "bearish" | "unknown" = "unknown"; let lastBrokenHigh = -1, lastBrokenLow = -1;
  for (let i = Math.max(2, swingWindow + 1); i < bars.length; i++) {
    const priorHigh = [...swingHighs].reverse().find(x => x.i < i); const priorLow = [...swingLows].reverse().find(x => x.i < i);
    if (priorHigh && priorHigh.i !== lastBrokenHigh && bars[i].close > priorHigh.price) { const kind = structure === "bearish" ? "choch" : "bos"; features.push({ kind, index: i, price: priorHigh.price, direction: "bullish", score: kind === "choch" ? 1 : 0.75, note: `close broke prior swing high @ ${priorHigh.price}` }); structure = "bullish"; lastBrokenHigh = priorHigh.i; }
    if (priorLow && priorLow.i !== lastBrokenLow && bars[i].close < priorLow.price) { const kind = structure === "bullish" ? "choch" : "bos"; features.push({ kind, index: i, price: priorLow.price, direction: "bearish", score: kind === "choch" ? 1 : 0.75, note: `close broke prior swing low @ ${priorLow.price}` }); structure = "bearish"; lastBrokenLow = priorLow.i; }
    if (i >= 2) { if (bars[i].low > bars[i - 2].high) features.push({ kind: "bullish-fvg", index: i, price: (bars[i].low + bars[i - 2].high) / 2, direction: "bullish", score: 0.55, note: "three-candle bullish imbalance" }); if (bars[i].high < bars[i - 2].low) features.push({ kind: "bearish-fvg", index: i, price: (bars[i].high + bars[i - 2].low) / 2, direction: "bearish", score: 0.55, note: "three-candle bearish imbalance" }); }
    const a = atr(bars, i, 14); const body = Math.abs(bars[i].close - bars[i].open);
    if (a > 0 && body >= a * displacementAtr) {
      const direction = bars[i].close >= bars[i].open ? "bullish" : "bearish"; features.push({ kind: "displacement", index: i, direction, score: 0.6, note: `candle body ${(body / a).toFixed(2)} ATR` });
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) { const bearish = bars[j].close < bars[j].open; if (direction === "bullish" && bearish) { features.push({ kind: "bullish-ob", index: j, price: bars[j].open, direction: "bullish", score: 0.45, note: "last bearish candle before bullish displacement" }); break; } if (direction === "bearish" && !bearish) { features.push({ kind: "bearish-ob", index: j, price: bars[j].open, direction: "bearish", score: 0.45, note: "last bullish candle before bearish displacement" }); break; } }
    }
    if (i >= lookback) { let priorMax = -Infinity, priorMin = Infinity; for (let j = i - lookback; j < i; j++) { priorMax = Math.max(priorMax, bars[j].high); priorMin = Math.min(priorMin, bars[j].low); } if (bars[i].high > priorMax && bars[i].close < priorMax) features.push({ kind: "buy-side-sweep", index: i, price: priorMax, direction: "bearish", score: 0.9, note: "wick swept prior buy-side liquidity and closed back below" }); if (bars[i].low < priorMin && bars[i].close > priorMin) features.push({ kind: "sell-side-sweep", index: i, price: priorMin, direction: "bullish", score: 0.9, note: "wick swept prior sell-side liquidity and closed back above" }); }
  }
  for (let k = 1; k < swingHighs.length; k++) { const cur = swingHighs[k], prev = swingHighs[k - 1], a = atr(bars, cur.i, 14); if (a > 0 && Math.abs(cur.price - prev.price) <= a * eqTolAtr) features.push({ kind: "equal-highs", index: cur.i, price: (cur.price + prev.price) / 2, score: 0.5, note: "near-equal swing highs / buy-side liquidity pool" }); }
  for (let k = 1; k < swingLows.length; k++) { const cur = swingLows[k], prev = swingLows[k - 1], a = atr(bars, cur.i, 14); if (a > 0 && Math.abs(cur.price - prev.price) <= a * eqTolAtr) features.push({ kind: "equal-lows", index: cur.i, price: (cur.price + prev.price) / 2, score: 0.5, note: "near-equal swing lows / sell-side liquidity pool" }); }
  return { features, structure, swingHighs, swingLows };
}

export function ictSmcSignal(spec: StrategySpec, bars: MarketBar[]): { signal: -1 | 0 | 1; reason: string; score: number; features: SmcFeature[] } {
  if (bars.length < 40) return { signal: 0, reason: "ICT/SMC warmup", score: 0, features: [] };
  const result = detectIctSmc(bars, spec); const i = bars.length - 1; const recent = result.features.filter(f => f.index >= i - Math.max(3, Math.round(spec.params.confirmBars || 4)));
  let bull = 0, bear = 0; for (const f of recent) { if (f.direction === "bullish") bull += f.score; if (f.direction === "bearish") bear += f.score; }
  const minScore = Math.max(0.8, spec.params.minScore || 1.4); const signal: -1 | 0 | 1 = bull >= minScore && bull > bear * 1.15 ? 1 : bear >= minScore && bear > bull * 1.15 ? -1 : 0;
  return { signal, score: Number(Math.max(bull, bear).toFixed(3)), reason: signal === 1 ? `bullish ICT/SMC confluence ${bull.toFixed(2)}` : signal === -1 ? `bearish ICT/SMC confluence ${bear.toFixed(2)}` : `no ICT/SMC confluence (bull=${bull.toFixed(2)}, bear=${bear.toFixed(2)})`, features: recent };
}
