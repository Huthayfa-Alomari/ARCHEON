import { listExperiments, listHypotheses } from "./store";

export async function rankValidated(limit = 20) {
  const hypotheses = await listHypotheses(200);
  const experiments = await listExperiments(undefined, 500);
  const byId = new Map(experiments.map((e) => [e.id, e]));
  const rows = hypotheses.flatMap((h) => {
    if (!h.latestExperimentId) return [];
    const e = byId.get(h.latestExperimentId); if (!e) return [];
    const m = e.validation.test;
    const score = e.validation.robustnessScore * 45
      + Math.min(2, Math.max(0, m.profitFactor)) / 2 * 20
      + Math.max(0, 1 - m.maxDrawdownPct / 30) * 15
      + e.validation.walkForwardPositiveFoldRate * 10
      + e.validation.bootstrapPositiveProbability * 10;
    return [{ hypothesisId: h.id, title: h.title, status: h.status, strategy: h.strategy, score: Number(score.toFixed(2)), robustness: e.validation.robustnessScore, test: m }];
  });
  return rows.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 100)));
}
