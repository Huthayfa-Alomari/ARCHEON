import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";
import { redactSecrets } from "./redaction";

export type LearningSource = "user" | "assistant" | "tool" | "api" | "workspace" | "system";

export type LearnedRecord = {
  id: string;
  fingerprint: string;
  content: string;
  source: LearningSource;
  sourceRef?: string;
  reliability: number;
  createdAt: string;
  lastSeenAt: string;
  seenCount: number;
  useCount: number;
};

type Store = { version: 1; records: LearnedRecord[] };

function storePath() { return path.resolve(process.cwd(), jarvisConfig.learningPath); }
function normalize(text: string) { return text.toLowerCase().replace(/\s+/g, " ").trim(); }
function fingerprint(content: string, sourceRef = "") { return createHash("sha256").update(`${normalize(content)}|${sourceRef}`).digest("hex"); }

function redact(text: string) { return redactSecrets(text).slice(0, 6000); }

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath(), "utf8")) as Store;
    return { version: 1, records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch { return { version: 1, records: [] }; }
}

async function writeStore(store: Store) {
  const target = storePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (store.records.length > jarvisConfig.maxLearningItems) {
    store.records = store.records
      .sort((a, b) => (b.useCount + b.seenCount * 0.2 + b.reliability) - (a.useCount + a.seenCount * 0.2 + a.reliability))
      .slice(0, jarvisConfig.maxLearningItems);
  }
  await fs.writeFile(target, JSON.stringify(store, null, 2), "utf8");
}

export async function learn(content: string, source: LearningSource, options?: { sourceRef?: string; reliability?: number }) {
  if (!jarvisConfig.learningEnabled) return null;
  const clean = redact(content.trim());
  if (clean.length < 12) return null;
  const sourceRef = options?.sourceRef?.slice(0, 500);
  const fp = fingerprint(clean, sourceRef || source);
  const store = await readStore();
  const existing = store.records.find((item) => item.fingerprint === fp);
  const now = new Date().toISOString();
  if (existing) {
    existing.lastSeenAt = now;
    existing.seenCount += 1;
    existing.reliability = Math.max(existing.reliability, options?.reliability ?? existing.reliability);
    await writeStore(store);
    return existing;
  }
  const item: LearnedRecord = {
    id: randomUUID(), fingerprint: fp, content: clean, source, sourceRef,
    reliability: Math.max(0, Math.min(1, options?.reliability ?? (source === "tool" || source === "workspace" ? 0.9 : source === "user" ? 0.8 : 0.55))),
    createdAt: now, lastSeenAt: now, seenCount: 1, useCount: 0,
  };
  store.records.push(item);
  await writeStore(store);
  return item;
}

function tokens(text: string) {
  return [...new Set(normalize(text).split(/[^\p{L}\p{N}_-]+/u).filter((x) => x.length >= 2))];
}

export async function searchLearned(query: string, limit = 8) {
  const store = await readStore();
  const q = tokens(query);
  if (!q.length) return [];
  const scored = store.records.map((item) => {
    const hay = normalize(item.content);
    let score = 0;
    for (const token of q) if (hay.includes(token)) score += token.length > 5 ? 3 : 1;
    if (item.sourceRef && q.some((t) => item.sourceRef!.toLowerCase().includes(t))) score += 2;
    score += Math.min(2, item.seenCount * 0.15) + item.reliability;
    return { item, score };
  }).filter((x) => x.score > 1.2).sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit));

  if (scored.length) {
    const ids = new Set(scored.map((x) => x.item.id));
    for (const item of store.records) if (ids.has(item.id)) item.useCount += 1;
    await writeStore(store);
  }
  return scored.map(({ item, score }) => ({ ...item, score: Number(score.toFixed(2)) }));
}

export async function learningStats() {
  const store = await readStore();
  const bySource = store.records.reduce<Record<string, number>>((acc, item) => { acc[item.source] = (acc[item.source] || 0) + 1; return acc; }, {});
  return { enabled: jarvisConfig.learningEnabled, count: store.records.length, max: jarvisConfig.maxLearningItems, bySource };
}
