import { getExperiment, getHypothesis, setHypothesisStatus } from "./store";
import type { HypothesisStatus } from "./types";

const allowed: Record<HypothesisStatus, HypothesisStatus[]> = {
  proposed: ["testing", "retired"],
  testing: ["validated", "rejected", "retired"],
  rejected: ["testing", "retired"],
  validated: ["paper", "retired"],
  paper: ["shadow", "retired"],
  shadow: ["promoted", "paper", "retired"],
  promoted: ["shadow", "retired"],
  retired: [],
};

export async function promoteHypothesis(args: { hypothesisId: string; to: HypothesisStatus; reason?: string; actor?: "jarvis" | "owner"; paperTrades?: number; paperProfitFactor?: number; shadowDays?: number; shadowMaxDrawdownPct?: number }) {
  const h = await getHypothesis(args.hypothesisId);
  if (!h) throw new Error("Hypothesis not found.");
  if (!allowed[h.status].includes(args.to)) throw new Error(`Invalid lifecycle transition ${h.status} -> ${args.to}.`);

  const evidence: Record<string, number | string | boolean> = {};
  if (args.to === "paper") {
    if (!h.latestExperimentId) throw new Error("A validated experiment is required before paper stage.");
    const e = await getExperiment(h.latestExperimentId);
    if (!e?.validation.passes) throw new Error("Latest experiment did not pass validation gates.");
    evidence.robustnessScore = e.validation.robustnessScore;
  }
  if (args.to === "shadow") {
    const trades = Number(args.paperTrades || 0); const pf = Number(args.paperProfitFactor || 0);
    if (trades < 30 || pf < 1.05) throw new Error("Shadow promotion requires >=30 paper trades and paper profit factor >=1.05.");
    evidence.paperTrades = trades; evidence.paperProfitFactor = pf;
  }
  if (args.to === "promoted") {
    const days = Number(args.shadowDays || 0); const dd = Number(args.shadowMaxDrawdownPct ?? 999);
    if (days < 14 || dd > 10) throw new Error("Live promotion requires >=14 shadow days and shadow max drawdown <=10%.");
    evidence.shadowDays = days; evidence.shadowMaxDrawdownPct = dd;
  }
  return setHypothesisStatus(h.id, args.to, args.reason || `Lifecycle transition ${h.status} -> ${args.to}`, args.actor || "jarvis", evidence);
}
