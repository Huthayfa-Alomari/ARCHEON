import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "./config";
import type { ModelTask } from "./model-router";

type TaskMetric = {
  attempts: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  peerScoreSum: number;
  peerScoreSamples: number;
  userGood: number;
  userBad: number;
};

export type ModelPerformanceRecord = {
  routeId: string;
  provider: string;
  model: string;
  tasks: Partial<Record<ModelTask, TaskMetric>>;
  updatedAt: string;
};

type Store = { version: 1; models: ModelPerformanceRecord[] };

function targetPath() { return path.resolve(process.cwd(), jarvisConfig.modelPerformancePath); }
function emptyMetric(): TaskMetric { return { attempts: 0, successes: 0, failures: 0, totalLatencyMs: 0, peerScoreSum: 0, peerScoreSamples: 0, userGood: 0, userBad: 0 }; }

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(targetPath(), "utf8")) as Store;
    return { version: 1, models: Array.isArray(parsed.models) ? parsed.models : [] };
  } catch { return { version: 1, models: [] }; }
}

async function writeStore(store: Store) {
  const file = targetPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

function ensure(store: Store, route: { id: string; provider: string; model: string }) {
  let row = store.models.find((m) => m.routeId === route.id);
  if (!row) {
    row = { routeId: route.id, provider: route.provider, model: route.model, tasks: {}, updatedAt: new Date().toISOString() };
    store.models.push(row);
  }
  return row;
}

export async function recordModelAttempt(args: {
  route: { id: string; provider: string; model: string };
  task: ModelTask;
  ok: boolean;
  latencyMs: number;
  peerScore?: number;
}) {
  const store = await readStore();
  const row = ensure(store, args.route);
  const metric = row.tasks[args.task] || emptyMetric();
  metric.attempts += 1;
  metric.totalLatencyMs += Math.max(0, Math.trunc(args.latencyMs));
  if (args.ok) metric.successes += 1; else metric.failures += 1;
  if (typeof args.peerScore === "number" && Number.isFinite(args.peerScore)) {
    metric.peerScoreSum += Math.max(0, Math.min(1, args.peerScore));
    metric.peerScoreSamples += 1;
  }
  row.tasks[args.task] = metric;
  row.updatedAt = new Date().toISOString();
  await writeStore(store);
}

export async function recordUserFeedback(routeIds: string[], task: ModelTask, rating: "good" | "bad") {
  if (!routeIds.length) return;
  const store = await readStore();
  for (const row of store.models) {
    if (!routeIds.includes(row.routeId)) continue;
    const metric = row.tasks[task] || emptyMetric();
    if (rating === "good") metric.userGood += 1; else metric.userBad += 1;
    row.tasks[task] = metric;
    row.updatedAt = new Date().toISOString();
  }
  await writeStore(store);
}

export async function getPerformanceScore(routeId: string, task: ModelTask) {
  const store = await readStore();
  const metric = store.models.find((m) => m.routeId === routeId)?.tasks[task];
  if (!metric || metric.attempts < 2) return 0;
  const successRate = metric.successes / Math.max(1, metric.attempts);
  const peer = metric.peerScoreSamples ? metric.peerScoreSum / metric.peerScoreSamples : 0.5;
  const userTotal = metric.userGood + metric.userBad;
  const user = userTotal ? metric.userGood / userTotal : 0.5;
  // Small bounded bonus only. Learned history must not overpower current evidence/task fit.
  return Math.max(-10, Math.min(10, (successRate - 0.5) * 8 + (peer - 0.5) * 6 + (user - 0.5) * 6));
}

export async function modelPerformanceSummary() {
  const store = await readStore();
  return store.models.map((row) => ({
    routeId: row.routeId,
    provider: row.provider,
    model: row.model,
    tasks: Object.fromEntries(Object.entries(row.tasks).map(([task, metric]) => {
      const m = metric as TaskMetric;
      return [task, {
        attempts: m.attempts,
        successRate: m.attempts ? Number((m.successes / m.attempts).toFixed(3)) : 0,
        avgLatencyMs: m.attempts ? Math.round(m.totalLatencyMs / m.attempts) : 0,
        peerAgreement: m.peerScoreSamples ? Number((m.peerScoreSum / m.peerScoreSamples).toFixed(3)) : null,
        userGood: m.userGood,
        userBad: m.userBad,
      }];
    })),
    updatedAt: row.updatedAt,
  }));
}
