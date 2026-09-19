import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";
import { redactSecrets } from "./redaction";

export type KnowledgeSourceKind = "book" | "dataset" | "paper" | "api" | "local" | "web";

export type KnowledgeChunk = {
  id: string;
  fingerprint: string;
  sourceId: string;
  sourceKind: KnowledgeSourceKind;
  title: string;
  sourceRef: string;
  license?: string;
  tags: string[];
  trust: number;
  chunkIndex: number;
  content: string;
  createdAt: string;
};

type Store = { version: 1; chunks: KnowledgeChunk[] };

function storePath() { return path.resolve(process.cwd(), jarvisConfig.knowledgeStorePath); }
function normalize(text: string) { return text.toLowerCase().replace(/\s+/g, " ").trim(); }
function fp(text: string, sourceRef: string) { return createHash("sha256").update(`${normalize(text)}|${sourceRef}`).digest("hex"); }

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath(), "utf8")) as Store;
    return { version: 1, chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [] };
  } catch { return { version: 1, chunks: [] }; }
}

async function writeStore(store: Store) {
  const target = storePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (store.chunks.length > jarvisConfig.maxKnowledgeChunks) {
    store.chunks = store.chunks.slice(-jarvisConfig.maxKnowledgeChunks);
  }
  await fs.writeFile(target, JSON.stringify(store, null, 2), "utf8");
}

function chunkText(text: string, chunkChars = 3200, overlap = 320) {
  const clean = redactSecrets(text).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + chunkChars);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf("\n\n", end), clean.lastIndexOf(". ", end));
      if (boundary > start + Math.floor(chunkChars * 0.55)) end = boundary + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece.length >= 80) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export async function ingestKnowledgeText(input: {
  title: string;
  sourceRef: string;
  sourceKind: KnowledgeSourceKind;
  text: string;
  license?: string;
  tags?: string[];
  trust?: number;
}) {
  const store = await readStore();
  const pieces = chunkText(input.text, jarvisConfig.knowledgeChunkChars, jarvisConfig.knowledgeChunkOverlap);
  const sourceId = createHash("sha256").update(input.sourceRef).digest("hex").slice(0, 24);
  const trust = Math.max(0, Math.min(1, input.trust ?? 0.75));
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  for (let i = 0; i < pieces.length; i += 1) {
    const content = pieces[i];
    const fingerprint = fp(content, input.sourceRef);
    if (store.chunks.some((x) => x.fingerprint === fingerprint)) { skipped += 1; continue; }
    store.chunks.push({
      id: randomUUID(), fingerprint, sourceId, sourceKind: input.sourceKind,
      title: input.title.slice(0, 300), sourceRef: input.sourceRef.slice(0, 1000),
      license: input.license?.slice(0, 200), tags: (input.tags || []).slice(0, 20).map((x) => x.slice(0, 80)),
      trust, chunkIndex: i, content, createdAt: now,
    });
    added += 1;
  }
  await writeStore(store);
  return { sourceId, chunks: pieces.length, added, skipped };
}

function tokens(text: string) {
  return [...new Set(normalize(text).split(/[^\p{L}\p{N}_-]+/u).filter((x) => x.length >= 2))];
}

export async function searchKnowledge(query: string, limit = 8) {
  const store = await readStore();
  const q = tokens(query);
  if (!q.length) return [];
  return store.chunks.map((item) => {
    const hay = normalize(`${item.title} ${item.tags.join(" ")} ${item.content}`);
    let score = item.trust;
    for (const token of q) if (hay.includes(token)) score += token.length > 6 ? 3 : 1;
    if (q.some((t) => item.title.toLowerCase().includes(t))) score += 2;
    return { ...item, score: Number(score.toFixed(2)) };
  }).filter((x) => x.score > 1.5).sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit));
}

export async function knowledgeStats() {
  const store = await readStore();
  const sources = new Set(store.chunks.map((x) => x.sourceId));
  const byKind = store.chunks.reduce<Record<string, number>>((acc, x) => { acc[x.sourceKind] = (acc[x.sourceKind] || 0) + 1; return acc; }, {});
  return { sources: sources.size, chunks: store.chunks.length, maxChunks: jarvisConfig.maxKnowledgeChunks, byKind };
}
