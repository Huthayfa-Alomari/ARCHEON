import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jarvisConfig } from "../config";
import type { HypothesisStatus, PromotionRecord, ResearchExperiment, ResearchHypothesis, StrategySpec } from "./types";

type ResearchDb = { hypotheses: ResearchHypothesis[]; experiments: ResearchExperiment[]; promotions: PromotionRecord[] };

async function readDb(): Promise<ResearchDb> {
  try {
    const db = JSON.parse(await fs.readFile(jarvisConfig.researchStorePath, "utf8")) as Partial<ResearchDb>;
    return { hypotheses: db.hypotheses || [], experiments: db.experiments || [], promotions: db.promotions || [] };
  } catch {
    return { hypotheses: [], experiments: [], promotions: [] };
  }
}

async function writeDb(db: ResearchDb) {
  const target = path.resolve(jarvisConfig.researchStorePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(db, null, 2), "utf8");
}

export async function createHypothesis(input: {
  title: string; claim: string; rationale?: string; sourceRefs?: string[]; tags?: string[]; strategy: StrategySpec;
  parentHypothesisId?: string; generation?: number; evidenceScore?: number;
}) {
  const db = await readDb();
  const now = new Date().toISOString();
  const item: ResearchHypothesis = {
    id: `hyp_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    title: input.title.slice(0, 200),
    claim: input.claim.slice(0, 4000),
    rationale: (input.rationale || "").slice(0, 6000),
    sourceRefs: (input.sourceRefs || []).slice(0, 30),
    tags: (input.tags || []).slice(0, 30),
    strategy: input.strategy,
    status: "proposed",
    parentHypothesisId: input.parentHypothesisId,
    generation: input.generation || 0,
    evidenceScore: Math.max(0, Math.min(1, input.evidenceScore ?? 0.5)),
  };
  db.hypotheses.unshift(item);
  await writeDb(db);
  return item;
}

export async function listHypotheses(limit = 50, status?: HypothesisStatus) {
  const db = await readDb();
  const rows = status ? db.hypotheses.filter((h) => h.status === status) : db.hypotheses;
  return rows.slice(0, Math.max(1, Math.min(limit, 200)));
}

export async function getHypothesis(id: string) {
  const db = await readDb();
  return db.hypotheses.find((h) => h.id === id) || null;
}

export async function getExperiment(id: string) {
  const db = await readDb();
  return db.experiments.find((e) => e.id === id) || null;
}

export async function listExperiments(hypothesisId?: string, limit = 100) {
  const db = await readDb();
  const rows = hypothesisId ? db.experiments.filter((e) => e.hypothesisId === hypothesisId) : db.experiments;
  return rows.slice(0, Math.max(1, Math.min(limit, 500)));
}

export async function addExperiment(experiment: ResearchExperiment) {
  const db = await readDb();
  db.experiments.unshift(experiment);
  const h = db.hypotheses.find((x) => x.id === experiment.hypothesisId);
  if (h) {
    h.latestExperimentId = experiment.id;
    h.updatedAt = new Date().toISOString();
    h.status = experiment.validation.passes ? "validated" : "rejected";
  }
  await writeDb(db);
  return experiment;
}

export async function setHypothesisStatus(id: string, to: HypothesisStatus, reason: string, actor: "jarvis" | "owner", evidence?: Record<string, number | string | boolean>) {
  const db = await readDb();
  const h = db.hypotheses.find((x) => x.id === id);
  if (!h) throw new Error("Hypothesis not found.");
  const from = h.status;
  h.status = to;
  h.updatedAt = new Date().toISOString();
  const record: PromotionRecord = { id: `prm_${randomUUID()}`, hypothesisId: id, from, to: to as any, createdAt: h.updatedAt, reason: reason.slice(0, 2000), actor, evidence };
  db.promotions.unshift(record);
  await writeDb(db);
  return { hypothesis: h, promotion: record };
}

export async function listPromotions(hypothesisId?: string, limit = 100) {
  const db = await readDb();
  const rows = hypothesisId ? db.promotions.filter((p) => p.hypothesisId === hypothesisId) : db.promotions;
  return rows.slice(0, Math.max(1, Math.min(limit, 500)));
}

export async function researchStats() {
  const db = await readDb();
  const status: Record<string, number> = {};
  for (const h of db.hypotheses) status[h.status] = (status[h.status] || 0) + 1;
  return { hypotheses: db.hypotheses.length, experiments: db.experiments.length, promotions: db.promotions.length, status };
}
