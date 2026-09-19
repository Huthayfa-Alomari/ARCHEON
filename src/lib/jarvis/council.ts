import { randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";
import { audit } from "./audit";
import { callModelRoute, type ChatTurn, type ProviderMessage } from "./llm";
import { classifyModelTask, routeModels, type ModelRoute, type ModelTask } from "./model-router";
import { getPerformanceScore, recordModelAttempt, recordUserFeedback } from "./model-performance";
import { saveCouncilMemory, setCouncilFeedback, type CouncilMemoryRecord } from "./cognitive-memory";
import type { ToolObservation } from "./types";

type Candidate = {
  label: string;
  route: ModelRoute;
  answer: string;
  confidence: number;
  claims: string[];
  uncertainties: string[];
  latencyMs: number;
  ok: boolean;
  error?: string;
  voteShare: number;
};

type Critique = {
  routeId: string;
  preferredLabels: string[];
  corrections: string[];
  disputedClaims: string[];
  followUpChecks: string[];
  confidence: number;
  raw: string;
};

export type CouncilMeta = {
  sessionId: string;
  mode: string;
  task: ModelTask;
  modelsAsked: number;
  modelsAnswered: number;
  modelsFailed: number;
  rounds: number;
  consensus: number;
  confidence: number;
  arbiter?: string;
  disagreements: string[];
};

export type CouncilResult = { answer: string; meta: CouncilMeta };

type CouncilInput = {
  system: string;
  history: ChatTurn[];
  message: string;
  observations?: ToolObservation[];
  force?: boolean;
};

function clamp01(value: unknown, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function strings(value: unknown, max = 12) {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, max) : [];
}

function observationsText(observations?: ToolObservation[]) {
  if (!observations?.length) return "No external/tool evidence was collected for this question.";
  return observations.map((o, i) => `[EVIDENCE ${i + 1} | ${o.tool} | ${o.ok ? "OK" : "FAILED"}]\n${o.summary.slice(0, 7000)}`).join("\n\n");
}

function labelFor(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return index < alphabet.length ? alphabet[index] : `M${index + 1}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, () => worker()));
  return results;
}

function normalizeWords(text: string) {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3));
}

function jaccard(a: string, b: string) {
  const aa = normalizeWords(a); const bb = normalizeWords(b);
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const x of aa) if (bb.has(x)) overlap += 1;
  return overlap / (aa.size + bb.size - overlap);
}

function similarityConsensus(candidates: Candidate[]) {
  const ok = candidates.filter((c) => c.ok);
  if (ok.length <= 1) return ok.length === 1 ? 0.35 : 0;
  const values: number[] = [];
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) values.push(jaccard(ok[i].answer, ok[j].answer));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

async function selectRoutes(message: string) {
  const routed = routeModels(message, 64);
  const enriched = await Promise.all(routed.routes.map(async (entry) => ({ ...entry, learnedBonus: await getPerformanceScore(entry.route.id, routed.task) })));
  enriched.sort((a, b) => (b.score + b.learnedBonus) - (a.score + a.learnedBonus));
  const max = jarvisConfig.councilMaxModels;
  return { task: routed.task, routes: max === 0 ? enriched : enriched.slice(0, max) };
}

export function shouldUseCouncil(message: string, force = false) {
  if (force) return true;
  if (jarvisConfig.councilMode === "off" || jarvisConfig.councilMode === "manual") return false;
  if (jarvisConfig.councilMode === "always") return true;
  const task = classifyModelTask(message);
  return ["reasoning", "coding", "long-context"].includes(task) || /\?|هل|ليش|لماذا|كيف|قارن|الأصح|الصح|تحقق|verify|compare|why|how/i.test(message);
}

async function initialAnswer(route: ModelRoute, label: string, input: CouncilInput): Promise<Candidate> {
  const started = Date.now();
  const messages: ProviderMessage[] = [
    { role: "system", content: `${input.system}\n\nYou are one independent member of a multi-model council. Do NOT assume other models agree with you. Solve the user's question independently. Prefer actual tool evidence in the system context over memory or consensus. If uncertain, say so.\n\nReturn JSON only:\n{"answer":"concise but complete answer","confidence":0.0,"claims":["atomic claim"],"uncertainties":["what may be wrong or needs verification"]}` },
    ...input.history,
    { role: "user", content: input.message },
  ];
  try {
    const raw = await withTimeout(callModelRoute(route, messages), jarvisConfig.councilTimeoutMs, `${route.provider}/${route.model}`);
    const parsed = extractJson(raw);
    const answer = typeof parsed?.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : raw.trim();
    return { label, route, answer, confidence: clamp01(parsed?.confidence), claims: strings(parsed?.claims), uncertainties: strings(parsed?.uncertainties), latencyMs: Date.now() - started, ok: true, voteShare: 0 };
  } catch (error) {
    return { label, route, answer: "", confidence: 0, claims: [], uncertainties: [], latencyMs: Date.now() - started, ok: false, error: error instanceof Error ? error.message : String(error), voteShare: 0 };
  }
}

function candidatePacket(candidates: Candidate[]) {
  return candidates.filter((c) => c.ok).map((c) => [
    `CANDIDATE ${c.label}`,
    `answer: ${c.answer.slice(0, 5500)}`,
    c.claims.length ? `claims: ${c.claims.join(" | ").slice(0, 3000)}` : "",
    c.uncertainties.length ? `uncertainties: ${c.uncertainties.join(" | ").slice(0, 1600)}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

async function critique(route: ModelRoute, input: CouncilInput, candidates: Candidate[]): Promise<Critique> {
  const packet = candidatePacket(candidates);
  const evidence = observationsText(input.observations);
  const prompt = `Original question:\n${input.message}\n\nAuthoritative/tool evidence (if any):\n${evidence}\n\nAnonymized independent answers:\n${packet}\n\nCross-examine these answers. Consensus is NOT proof. Identify contradictions, factual/logical errors, missing assumptions, and specific follow-up checks that would distinguish competing claims. Prefer external/tool evidence over majority vote.\n\nReturn JSON only:\n{"preferredCandidates":["A"],"corrections":["..."],"disputedClaims":["..."],"followUpChecks":["question/check that would establish truth"],"confidence":0.0}`;
  try {
    const raw = await withTimeout(callModelRoute(route, [
      { role: "system", content: "You are a skeptical peer reviewer in JARVIS Council. Candidate identities are hidden to reduce brand/model bias. Do not reward an answer merely because many candidates repeat it." },
      { role: "user", content: prompt },
    ]), jarvisConfig.councilTimeoutMs, `critique ${route.provider}/${route.model}`);
    const parsed = extractJson(raw);
    const validLabels = new Set(candidates.filter((c) => c.ok).map((c) => c.label));
    const preferred = strings(parsed?.preferredCandidates, 6).map((x) => x.toUpperCase()).filter((x) => validLabels.has(x));
    return { routeId: route.id, preferredLabels: preferred, corrections: strings(parsed?.corrections), disputedClaims: strings(parsed?.disputedClaims), followUpChecks: strings(parsed?.followUpChecks), confidence: clamp01(parsed?.confidence), raw };
  } catch (error) {
    return { routeId: route.id, preferredLabels: [], corrections: [], disputedClaims: [error instanceof Error ? error.message : String(error)], followUpChecks: [], confidence: 0, raw: "" };
  }
}

function applyVotes(candidates: Candidate[], critiques: Critique[]) {
  const votes = new Map<string, number>();
  let total = 0;
  for (const review of critiques) {
    if (!review.preferredLabels.length) continue;
    total += 1;
    const share = 1 / review.preferredLabels.length;
    for (const label of review.preferredLabels) votes.set(label, (votes.get(label) || 0) + share);
  }
  for (const candidate of candidates) candidate.voteShare = total ? (votes.get(candidate.label) || 0) / total : 0;
  const top = Math.max(0, ...candidates.map((c) => c.voteShare));
  return { topVoteShare: top, reviewersVoting: total };
}

async function synthesize(route: ModelRoute, input: CouncilInput, candidates: Candidate[], critiques: Critique[], consensus: number) {
  const reviewPacket = critiques.slice(0, 16).map((c, i) => `REVIEW ${i + 1}\npreferred=${c.preferredLabels.join(",") || "none"}\ncorrections=${c.corrections.join(" | ")}\ndisputes=${c.disputedClaims.join(" | ")}\nchecks=${c.followUpChecks.join(" | ")}`).join("\n\n");
  const evidence = observationsText(input.observations);
  const prompt = `Original question:\n${input.message}\n\nTool/external evidence:\n${evidence}\n\nIndependent answers:\n${candidatePacket(candidates)}\n\nPeer cross-examination:\n${reviewPacket || "No critique round available."}\n\nMeasured peer consensus signal=${consensus.toFixed(3)}. This is only a signal, NOT ground truth.\n\nProduce the most defensible final answer. Resolve conflicts only when evidence/reasoning supports resolution. If evidence is insufficient, explicitly preserve uncertainty. Do not mention hidden model brands unless useful.\n\nReturn JSON only:\n{"answer":"final user-facing answer","confidence":0.0,"consensus":0.0,"disagreements":["unresolved disagreement"],"supportedClaims":["claim supported by evidence/reasoning"],"uncertainClaims":["claim that remains uncertain"]}`;
  const raw = await withTimeout(callModelRoute(route, [
    { role: "system", content: `${input.system}\n\nYou are the JARVIS Council arbiter. Majority vote does not establish truth. Fresh authoritative evidence outranks model consensus. Preserve uncertainty when unresolved.` },
    { role: "user", content: prompt },
  ]), jarvisConfig.councilTimeoutMs, `arbiter ${route.provider}/${route.model}`);
  const parsed = extractJson(raw);
  return {
    answer: typeof parsed?.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : raw.trim(),
    confidence: clamp01(parsed?.confidence, Math.max(0.35, consensus)),
    consensus: clamp01(parsed?.consensus, consensus),
    disagreements: strings(parsed?.disagreements, 12),
    supportedClaims: strings(parsed?.supportedClaims, 20),
    uncertainClaims: strings(parsed?.uncertainClaims, 20),
  };
}

export async function generateCouncilReply(input: CouncilInput): Promise<CouncilResult | null> {
  if (!shouldUseCouncil(input.message, input.force)) return null;
  const selected = await selectRoutes(input.message);
  if (selected.routes.length < jarvisConfig.councilMinModels) return null;
  const routes = selected.routes.map((x) => x.route);
  const sessionId = randomUUID();
  await audit({ event: "council.start", ok: true, detail: `session=${sessionId} task=${selected.task} models=${routes.length}` });

  const candidates = await mapLimit(routes, jarvisConfig.councilConcurrency, (route, index) => initialAnswer(route, labelFor(index), input));
  const successful = candidates.filter((c) => c.ok);
  if (!successful.length) return null;

  let critiques: Critique[] = [];
  if (jarvisConfig.councilCritiqueRound && successful.length >= 2) {
    critiques = await mapLimit(successful.map((c) => c.route), jarvisConfig.councilConcurrency, (route) => critique(route, input, successful));
  }
  const vote = applyVotes(candidates, critiques);
  const consensusSignal = vote.reviewersVoting ? vote.topVoteShare : similarityConsensus(successful);

  // Pick arbiter using base router score + learned task performance, not peer vote alone.
  const arbiterRanked = await Promise.all(successful.map(async (candidate) => ({ candidate, bonus: await getPerformanceScore(candidate.route.id, selected.task) })));
  arbiterRanked.sort((a, b) => (b.candidate.voteShare * 8 + b.bonus + b.candidate.confidence * 4) - (a.candidate.voteShare * 8 + a.bonus + a.candidate.confidence * 4));
  const arbiter = arbiterRanked[0].candidate.route;

  let synthesis: Awaited<ReturnType<typeof synthesize>>;
  try {
    synthesis = await synthesize(arbiter, input, successful, critiques, consensusSignal);
  } catch {
    const fallback = [...successful].sort((a, b) => b.voteShare - a.voteShare || b.confidence - a.confidence)[0];
    synthesis = { answer: fallback.answer, confidence: fallback.confidence, consensus: consensusSignal, disagreements: critiques.flatMap((c) => c.disputedClaims).slice(0, 8), supportedClaims: fallback.claims, uncertainClaims: fallback.uncertainties };
  }

  const disagreements = [...new Set([...synthesis.disagreements, ...critiques.flatMap((c) => c.disputedClaims)])].filter(Boolean).slice(0, 12);
  for (const candidate of candidates) {
    await recordModelAttempt({ route: candidate.route, task: selected.task, ok: candidate.ok, latencyMs: candidate.latencyMs, peerScore: candidate.ok ? candidate.voteShare : undefined });
  }

  const memory: CouncilMemoryRecord = {
    id: sessionId,
    question: input.message.slice(0, 6000),
    answer: synthesis.answer.slice(0, 12000),
    task: selected.task,
    confidence: synthesis.confidence,
    consensus: synthesis.consensus,
    models: candidates.map((c) => ({ routeId: c.route.id, provider: c.route.provider, model: c.route.model, answer: c.answer.slice(0, 5000), ok: c.ok, latencyMs: c.latencyMs, voteShare: c.voteShare })),
    disagreements,
    arbiterRouteId: arbiter.id,
    createdAt: new Date().toISOString(),
  };
  await saveCouncilMemory(memory);
  await audit({ event: "council.complete", ok: true, detail: `session=${sessionId} answered=${successful.length}/${routes.length} consensus=${synthesis.consensus.toFixed(3)} confidence=${synthesis.confidence.toFixed(3)} arbiter=${arbiter.id}` });

  return {
    answer: synthesis.answer,
    meta: {
      sessionId,
      mode: jarvisConfig.councilMode,
      task: selected.task,
      modelsAsked: routes.length,
      modelsAnswered: successful.length,
      modelsFailed: routes.length - successful.length,
      rounds: jarvisConfig.councilCritiqueRound && successful.length >= 2 ? 3 : 2,
      consensus: synthesis.consensus,
      confidence: synthesis.confidence,
      arbiter: arbiter.id,
      disagreements,
    },
  };
}

export async function applyCouncilFeedback(sessionId: string, rating: "good" | "bad") {
  const session = await setCouncilFeedback(sessionId, rating);
  if (!session) return null;
  const strongest = session.models.filter((m) => m.ok).sort((a, b) => b.voteShare - a.voteShare).filter((m, index) => index < 3 || m.routeId === session.arbiterRouteId).map((m) => m.routeId);
  if (session.arbiterRouteId && !strongest.includes(session.arbiterRouteId)) strongest.push(session.arbiterRouteId);
  await recordUserFeedback([...new Set(strongest)], session.task, rating);
  await audit({ event: "council.feedback", ok: true, detail: `session=${sessionId} rating=${rating} routes=${strongest.join(",")}` });
  return session;
}
