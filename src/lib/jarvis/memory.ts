import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jarvisConfig } from "./config";

export type MemoryItem = {
  id: string;
  text: string;
  createdAt: string;
};

type MemoryFile = { notes: MemoryItem[] };

function filePath() {
  return path.resolve(process.cwd(), jarvisConfig.memoryPath);
}

async function readStore(): Promise<MemoryFile> {
  try {
    const raw = await fs.readFile(filePath(), "utf8");
    const parsed = JSON.parse(raw) as MemoryFile;
    return { notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
  } catch {
    return { notes: [] };
  }
}

async function writeStore(store: MemoryFile) {
  const target = filePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(store, null, 2), "utf8");
}

export async function remember(text: string): Promise<MemoryItem> {
  const store = await readStore();
  const item: MemoryItem = { id: randomUUID(), text: text.trim(), createdAt: new Date().toISOString() };
  store.notes.push(item);
  await writeStore(store);
  return item;
}

export async function recall(limit = 12): Promise<MemoryItem[]> {
  const store = await readStore();
  return store.notes.slice(-Math.max(1, limit)).reverse();
}
