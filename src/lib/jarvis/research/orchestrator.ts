import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateHypothesis } from "./backtest";
import { listHypotheses, listExperiments } from "./store";

export type DatasetSpec = { csvPath: string; symbol: string; timeframe: string };
export type CostScenario = { name?: string; spreadBps?: number; commissionBps?: number; slippageBps?: number };
type OrchestratorRun = { id: string; createdAt: string; seed: string; hypothesisIds: string[]; datasets: DatasetSpec[]; costs: CostScenario[]; maxRuns: number; completed: number; failed: number; results: Array<{ hypothesisId: string; symbol: string; timeframe: string; csvPath: string; costName: string; experimentId?: string; passed?: boolean; robustness?: number; profitFactor?: number; maxDrawdownPct?: number; error?: string }> };
const storePath = () => path.resolve(process.env.JARVIS_ORCHESTRATOR_STORE_PATH || "./data/research-orchestrator.json");
async function readRuns(): Promise<OrchestratorRun[]> { try { return JSON.parse(await fs.readFile(storePath(), "utf8")) as OrchestratorRun[]; } catch { return []; } }
async function saveRuns(runs: OrchestratorRun[]) { await fs.mkdir(path.dirname(storePath()), { recursive: true }); await fs.writeFile(storePath(), JSON.stringify(runs.slice(0, 100), null, 2), "utf8"); }

export async function runResearchMatrix(args: { hypothesisIds?: string[]; datasets: DatasetSpec[]; costs?: CostScenario[]; maxRuns?: number; seed?: string }) {
  const all = await listHypotheses(200); const hypothesisIds = (args.hypothesisIds?.length ? args.hypothesisIds : all.filter(h => h.status !== "retired").map(h => h.id)).slice(0, 100);
  if (!args.datasets?.length) throw new Error("At least one dataset is required."); const datasets = args.datasets.slice(0, 30); const costs = (args.costs?.length ? args.costs : [{ name: "base", spreadBps: 2, commissionBps: 1, slippageBps: 1 }]).slice(0, 8);
  const seed=String(args.seed || "jarvis-orchestrator-v1");
  const maxRuns = Math.max(1, Math.min(Number(args.maxRuns || 300), 500)); const plan = hypothesisIds.flatMap(hypothesisId => datasets.flatMap(ds => costs.map(cost => ({ hypothesisId, ds, cost })))).slice(0, maxRuns);
  const run: OrchestratorRun = { id: `orch_${randomUUID()}`, createdAt: new Date().toISOString(), seed, hypothesisIds, datasets, costs, maxRuns, completed: 0, failed: 0, results: [] };
  for (const item of plan) {
    try { const e = await validateHypothesis({ hypothesisId: item.hypothesisId, csvPath: item.ds.csvPath, symbol: item.ds.symbol, timeframe: item.ds.timeframe, spreadBps: item.cost.spreadBps || 0, commissionBps: item.cost.commissionBps || 0, slippageBps: item.cost.slippageBps || 0, seed: `${seed}|${item.hypothesisId}|${item.ds.symbol}|${item.ds.timeframe}|${item.ds.csvPath}|${item.cost.name||"scenario"}` }); run.results.push({ hypothesisId: item.hypothesisId, symbol: item.ds.symbol, timeframe: item.ds.timeframe, csvPath: item.ds.csvPath, costName: item.cost.name || "scenario", experimentId: e.id, passed: e.validation.passes, robustness: e.validation.robustnessScore, profitFactor: e.validation.test.profitFactor, maxDrawdownPct: e.validation.test.maxDrawdownPct }); run.completed++; }
    catch (e) { run.results.push({ hypothesisId: item.hypothesisId, symbol: item.ds.symbol, timeframe: item.ds.timeframe, csvPath: item.ds.csvPath, costName: item.cost.name || "scenario", error: e instanceof Error ? e.message : "unknown error" }); run.failed++; }
  }
  const runs = await readRuns(); runs.unshift(run); await saveRuns(runs); return { ...run, planned: plan.length };
}
function median(xs: number[]) { if (!xs.length) return 0; const a=[...xs].sort((x,y)=>x-y); return a[Math.floor((a.length-1)/2)]; }
export async function buildChampionChallenger(args: { minCoverage?: number; minPassRate?: number; challengers?: number } = {}) {
  const hypotheses = await listHypotheses(300); const experiments = await listExperiments(undefined, 5000); const minCoverage = Math.max(1, Number(args.minCoverage || 2)); const minPassRate = Math.max(0, Math.min(1, Number(args.minPassRate ?? 0.6)));
  const rows = hypotheses.flatMap(h => { const ex = experiments.filter(e => e.hypothesisId === h.id); const coverage = new Set(ex.map(e => `${e.symbol || "?"}:${e.timeframe || "?"}:${e.dataRef}`)).size; if (coverage < minCoverage) return []; const passRate = ex.filter(e => e.validation.passes).length / Math.max(1, ex.length); const robustness = ex.map(e => e.validation.robustnessScore); const pfs = ex.map(e => e.validation.test.profitFactor).filter(Number.isFinite); const dds = ex.map(e => e.validation.test.maxDrawdownPct).filter(Number.isFinite); const score = median(robustness) * 50 + Math.min(2, median(pfs)) / 2 * 20 + passRate * 20 + Math.max(0, 1 - Math.max(0, ...dds) / 30) * 10; return [{ hypothesisId: h.id, title: h.title, status: h.status, strategy: h.strategy, coverage, experiments: ex.length, passRate: Number(passRate.toFixed(3)), medianRobustness: Number(median(robustness).toFixed(3)), medianProfitFactor: Number(median(pfs).toFixed(3)), worstMaxDrawdownPct: Number(Math.max(0, ...dds).toFixed(3)), score: Number(score.toFixed(2)), eligible: passRate >= minPassRate }]; }).sort((a,b)=>b.score-a.score);
  const eligible = rows.filter(r => r.eligible); return { generatedAt: new Date().toISOString(), researchOnly: true, criteria: { minCoverage, minPassRate }, champion: eligible[0] || null, challengers: eligible.slice(1, 1 + Math.max(1, Math.min(Number(args.challengers || 5), 20))), all: rows.slice(0, 50) };
}
export async function orchestratorHistory(limit = 20) { return (await readRuns()).slice(0, Math.max(1, Math.min(limit, 100))); }
