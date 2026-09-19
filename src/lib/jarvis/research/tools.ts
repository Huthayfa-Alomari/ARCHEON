import type { ToolCall, ToolExecutionResult } from "../types";
import { createHypothesis, listHypotheses, listPromotions, researchStats } from "./store";
import { validateHypothesis } from "./backtest";
import { generateCandidateBatch, mutateHypothesis } from "./generator";
import { promoteHypothesis } from "./lifecycle";
import { rankValidated } from "./ranking";
import { mineKnowledgeForHypotheses } from "./knowledge-miner";
import { runResearchMatrix, buildChampionChallenger, orchestratorHistory } from "./orchestrator";
import { runResearchSwarm } from "./reach-swarm";
import { enqueueFactoryJob, runFactory, factoryStatus, cancelFactoryJob, seedFactory } from "./factory";
import { crossoverHypotheses, evolvePopulation } from "./genome";
import { analyzeRegimes } from "./regimes";
import { agenticStackStatus } from "../agentic-stack";
import { recentTraces } from "../tracing";
import { snapshotMt5Dataset, listResearchDatasets } from "./datasets";

export async function executeResearchTool(call: ToolCall): Promise<ToolExecutionResult> {
  try {
    if (call.tool === "research.hypothesis.create") { const h = await createHypothesis(call.args as any); return { ok: true, tool: call.tool, summary: `Created hypothesis ${h.id}: ${h.title}`, data: h }; }
    if (call.tool === "research.hypothesis.list") { const rows = await listHypotheses(Number(call.args.limit || 50), call.args.status as any); return { ok: true, tool: call.tool, summary: `${rows.length} research hypotheses.`, data: rows }; }
    if (call.tool === "research.candidates.generate") { const b = await generateCandidateBatch(call.args as any); return { ok: true, tool: call.tool, summary: `Generated ${b.candidates.length} falsifiable strategy candidates from seed '${b.seed}'.`, data: b }; }
    if (call.tool === "research.knowledge.mine") { const r = await mineKnowledgeForHypotheses(call.args as any); return { ok: true, tool: call.tool, summary: `Mined ${r.chunks} Knowledge Fabric chunks and created ${r.created.length} testable hypotheses.`, data: r }; }
    if (call.tool === "research.candidates.mutate") { const rows = await mutateHypothesis(call.args as any); return { ok: true, tool: call.tool, summary: `Generated ${rows.length} child hypotheses.`, data: rows }; }
    if (call.tool === "research.rank") { const rows = await rankValidated(Number(call.args.limit || 20)); return { ok: true, tool: call.tool, summary: `Ranked ${rows.length} experimentally tested candidates.`, data: rows }; }
    if (call.tool === "research.orchestrator.run") { const x = await runResearchMatrix(call.args as any); return { ok: true, tool: call.tool, summary: `Research matrix ${x.id}: ${x.completed}/${x.planned} experiments completed, ${x.failed} failed.`, data: x }; }
    if (call.tool === "research.orchestrator.history") { const x = await orchestratorHistory(Number(call.args.limit || 20)); return { ok: true, tool: call.tool, summary: `${x.length} orchestrator runs.`, data: x }; }
    if (call.tool === "research.portfolio.championChallenger") { const x = await buildChampionChallenger(call.args as any); return { ok: true, tool: call.tool, summary: x.champion ? `Champion candidate: ${x.champion.title}; ${x.challengers.length} challengers. Research-only; no automatic live promotion.` : "No candidate met cross-dataset portfolio gates.", data: x }; }
    if (call.tool === "research.swarm.run") { const x = await runResearchSwarm(call.args as any); return { ok: true, tool: call.tool, summary: `Research swarm coverage ${x.coverage.available}/${x.coverage.requested} requested sources.`, data: x }; }
    if (call.tool === "research.factory.seed") { const x = await seedFactory(call.args as any); return { ok: true, tool: call.tool, summary: `Research Factory seeded ${x.enqueued} jobs.`, data: x }; }
    if (call.tool === "research.factory.enqueue") { const x = await enqueueFactoryJob(String(call.args.kind) as any, (call.args.payload || {}) as Record<string, unknown>, Number(call.args.maxAttempts || 2)); return { ok: true, tool: call.tool, summary: `Enqueued ${x.kind} job ${x.id}.`, data: x }; }
    if (call.tool === "research.factory.run") { const x = await runFactory(call.args as any); return { ok: true, tool: call.tool, summary: `Research Factory processed jobs. Queue: ${x.byStatus.queued}, completed: ${x.byStatus.completed}, failed: ${x.byStatus.failed}.`, data: x }; }
    if (call.tool === "research.factory.status") { const x = await factoryStatus(); return { ok: true, tool: call.tool, summary: `Research Factory: ${x.jobs} jobs; queued=${x.byStatus.queued}, running=${x.byStatus.running}, completed=${x.byStatus.completed}, failed=${x.byStatus.failed}.`, data: x }; }
    if (call.tool === "research.factory.cancel") { const x = await cancelFactoryJob(String(call.args.id || "")); return { ok: true, tool: call.tool, summary: `Cancelled job ${x.id}.`, data: x }; }
    if (call.tool === "research.genome.crossover") { const x = await crossoverHypotheses(call.args as any); return { ok: true, tool: call.tool, summary: `Created strategy genome ${x.genome.id} -> hypothesis ${x.hypothesis.id}.`, data: x }; }
    if (call.tool === "research.genome.evolve") { const x = await evolvePopulation(call.args as any); return { ok: true, tool: call.tool, summary: `Evolved ${x.offspring.length} offspring from ${x.parents.length} elite parents.`, data: x }; }
    if (call.tool === "research.regimes.analyze") { const x = await analyzeRegimes(call.args as any); return { ok: true, tool: call.tool, summary: `Regime scan: ${x.segments} segments across ${Object.keys(x.counts).length} regimes.`, data: x }; }
    if (call.tool === "research.agenticStack.status") { const x = await agenticStackStatus(); return { ok: true, tool: call.tool, summary: `${x.items.length} agentic-stack reference projects registered; guardrails/tracing/subagent/reach patterns enabled.`, data: x }; }
    if (call.tool === "research.traces.recent") { const x = await recentTraces(Number(call.args.limit || 100)); return { ok: true, tool: call.tool, summary: `${x.length} recent trace events.`, data: x }; }
    if (call.tool === "research.datasets.mt5Snapshot") { const x = await snapshotMt5Dataset(call.args as any); return { ok: true, tool: call.tool, summary: `Captured ${x.bars} ${x.symbol} ${x.timeframe} bars to ${x.csvPath}.`, data: x }; }
    if (call.tool === "research.datasets.list") { const x = await listResearchDatasets(); return { ok: true, tool: call.tool, summary: `${x.length} local Research Factory datasets.`, data: x }; }
    if (call.tool === "research.lifecycle.promote") { const r = await promoteHypothesis(call.args as any); return { ok: true, tool: call.tool, summary: `${r.hypothesis.id}: ${r.promotion.from} -> ${r.promotion.to}.`, data: r }; }
    if (call.tool === "research.lifecycle.history") { const rows = await listPromotions(call.args.hypothesisId ? String(call.args.hypothesisId) : undefined, Number(call.args.limit || 100)); return { ok: true, tool: call.tool, summary: `${rows.length} lifecycle records.`, data: rows }; }
    if (call.tool === "research.stats") { const s = await researchStats(); return { ok: true, tool: call.tool, summary: `Research Lab: ${s.hypotheses} hypotheses, ${s.experiments} experiments, ${s.promotions} lifecycle events.`, data: s }; }
    if (call.tool === "research.backtest.csv") { const e = await validateHypothesis(call.args as any); return { ok: true, tool: call.tool, summary: `Experiment ${e.id}: ${e.validation.passes ? "VALIDATED" : "REJECTED"}; OOS PF=${e.validation.test.profitFactor.toFixed(2)}, return=${e.validation.test.totalReturnPct.toFixed(2)}%, DD=${e.validation.test.maxDrawdownPct.toFixed(2)}%, robustness=${e.validation.robustnessScore.toFixed(2)}. ${e.validation.reasons.join("; ")}`, data: e }; }
    return { ok: false, tool: call.tool, summary: "Unknown Research Lab tool." };
  } catch (e) { return { ok: false, tool: call.tool, summary: `Research tool failed: ${e instanceof Error ? e.message : "unknown"}`, error: e instanceof Error ? e.message : "unknown" }; }
}
