import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "./config";
import type { ModelTask } from "./model-router";

export type CouncilModelRecord = {
  routeId: string;
  provider: string;
  model: string;
  answer: string;
  ok: boolean;
  latencyMs: number;
  voteShare: number;
};

export type CouncilMemoryRecord = {
  id: string;
  question: string;
  answer: string;
  task: ModelTask;
  confidence: number;
  consensus: number;
  models: CouncilModelRecord[];
  disagreements: string[];
  arbiterRouteId?: string;
  createdAt: string;
  feedback?: "good" | "bad";
};

type Store = { version: 1; sessions: CouncilMemoryRecord[] };
function targetPath() { return path.resolve(process.cwd(), jarvisConfig.cognitiveMemoryPath); }
function normalize(text: string) { return text.toLowerCase().replace(/\s+/g, " ").trim(); }
function tokens(text: string) { return [...new Set(normalize(text).split(/[^\p{L}\p{N}_-]+/u).filter((x) => x.length >= 3))]; }

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(targetPath(), "utf8")) as Store;
    return { version: 1, sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch { return { version: 1, sessions: [] }; }
}

async function writeStore(store: Store) {
  const file = targetPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Keep a bounded episodic history. Older knowledge is also represented in Learning Store.
  if (store.sessions.length > 1500) store.sessions = store.sessions.slice(-1500);
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

export async function saveCouncilMemory(record: CouncilMemoryRecord) {
  const store = await readStore();
  store.sessions.push(record);
  await writeStore(store);
}

export async function searchCouncilMemory(query: string, limit = 4) {
  const store = await readStore();
  const q = tokens(query);
  if (!q.length) return [];
  return store.sessions.map((session) => {
    const hay = normalize(`${session.question} ${session.answer} ${session.disagreements.join(" ")}`);
    let score = 0;
    for (const token of q) if (hay.includes(token)) score += token.length > 5 ? 3 : 1;
    score += session.confidence + session.consensus * 0.5;
    return { ...session, score };
  }).filter((x) => x.score > 1.5).sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function setCouncilFeedback(id: string, feedback: "good" | "bad") {
  const store = await readStore();
  const session = store.sessions.find((item) => item.id === id);
  if (!session) return null;
  session.feedback = feedback;
  await writeStore(store);
  return session;
}

export async function cognitiveMemoryStats() {
  const store = await readStore();
  const good = store.sessions.filter((s) => s.feedback === "good").length;
  const bad = store.sessions.filter((s) => s.feedback === "bad").length;
  return { sessions: store.sessions.length, goodFeedback: good, badFeedback: bad };
}
