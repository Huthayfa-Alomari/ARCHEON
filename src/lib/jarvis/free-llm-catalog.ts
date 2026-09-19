import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "./config";
import { safeFetchText } from "./safe-net";

export type FreeLlmProvider = {
  name: string;
  url?: string;
  access: "free" | "trial";
  models: string[];
  notes: string[];
};

type Catalog = { source: string; syncedAt: string; providers: FreeLlmProvider[] };
const SOURCE = "https://raw.githubusercontent.com/raullenchai/free-llm-api-resources/main/README.md";

function catalogPath() { return path.resolve(process.cwd(), jarvisConfig.freeLlmCatalogPath); }
function clean(text: string) { return text.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim(); }

function headingInfo(line: string) {
  const match = line.match(/^###\s+(?:\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(.+?))\s*$/);
  if (!match) return null;
  return { name: clean(match[1] || match[3] || ""), url: match[2] };
}

function isSeparator(text: string) { return /^[-: |]+$/.test(text.trim()); }
function looksModelish(text: string) {
  const value = clean(text).replace(/^\*\s+/, "");
  if (!value || value.length > 100) return false;
  if (/^(model name|models?|provider|credits?|requirements?|limits?|notes?)$/i.test(value)) return false;
  return /(?:qwen|deepseek|glm|minimax|kimi|llama|gemma|mistral|gpt|whisper|codestral|jamba|phi|solar|nemotron|devstral|voxtral|allam|aya|command|hermes|arcee|liquid|openchat|starling)/i.test(value);
}

export function parseFreeLlmReadme(markdown: string): FreeLlmProvider[] {
  const lines = markdown.split(/\r?\n/);
  const providers: FreeLlmProvider[] = [];
  let access: "free" | "trial" | null = null;
  let current: FreeLlmProvider | null = null;

  const flush = () => {
    if (!current) return;
    current.models = [...new Set(current.models.map(clean).filter(Boolean))].slice(0, 120);
    current.notes = [...new Set(current.notes.map(clean).filter(Boolean))].slice(0, 40);
    providers.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+Free Providers/i.test(line)) { flush(); access = "free"; continue; }
    if (/^##\s+Providers with trial credits/i.test(line)) { flush(); access = "trial"; continue; }
    if (/^##\s+/.test(line) && !/^###\s+/.test(line)) { flush(); if (!/Providers/i.test(line)) access = null; continue; }

    const heading = headingInfo(line);
    if (heading && access) {
      flush();
      current = { name: heading.name, url: heading.url, access, models: [], notes: [] };
      continue;
    }
    if (!current || !line) continue;

    const bullet = line.match(/^[-*]\s+(.+)/)?.[1];
    if (bullet) {
      const value = clean(bullet.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      if (looksModelish(value)) current.models.push(value);
      else if (value.length <= 220) current.notes.push(value);
      continue;
    }

    if (line.startsWith("|")) {
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(clean);
      if (cells.some(isSeparator)) continue;
      for (const cell of cells) if (looksModelish(cell)) current.models.push(cell);
      continue;
    }

    if (/<tr[>\s]/i.test(line) && /<td[>\s]/i.test(line)) {
      const cells = [...line.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
      for (const cell of cells) if (looksModelish(cell)) current.models.push(cell);
      continue;
    }

    const plain = clean(line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\*+|\*+$/g, ""));
    const label = plain.match(/^(Credits|Requirements|Limits(?: \(per-model\))?|Models|Note):\s*(.+)$/i);
    if (label) {
      const value = `${label[1]}: ${clean(label[2])}`;
      if (/^Models:/i.test(value) && looksModelish(label[2])) current.models.push(clean(label[2]));
      else current.notes.push(value);
    }
  }
  flush();
  return providers.filter((p) => p.name);
}

async function readCatalog(): Promise<Catalog | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(catalogPath(), "utf8")) as Catalog;
    return Array.isArray(parsed.providers) ? parsed : null;
  } catch { return null; }
}

async function writeCatalog(catalog: Catalog) {
  const target = catalogPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(catalog, null, 2), "utf8");
}

export async function syncFreeLlmCatalog() {
  const fetched = await safeFetchText(SOURCE, { maxBytes: 900_000 });
  const providers = parseFreeLlmReadme(fetched.text);
  if (providers.length < 10) throw new Error(`Parsed only ${providers.length} LLM providers; refusing incomplete catalog replacement.`);
  const catalog: Catalog = { source: SOURCE, syncedAt: new Date().toISOString(), providers };
  await writeCatalog(catalog);
  return catalog;
}

export async function getFreeLlmCatalog(autoSync = true): Promise<Catalog> {
  const catalog = await readCatalog();
  if (!autoSync) return catalog || { source: SOURCE, syncedAt: "", providers: [] };
  const ageMs = catalog?.syncedAt ? Date.now() - Date.parse(catalog.syncedAt) : Number.POSITIVE_INFINITY;
  const stale = !catalog || !Number.isFinite(ageMs) || ageMs > jarvisConfig.freeLlmCatalogRefreshHours * 60 * 60 * 1000;
  if (!stale && catalog) return catalog;
  try { return await syncFreeLlmCatalog(); }
  catch (error) {
    if (catalog?.providers.length) return catalog;
    throw error;
  }
}

function tokens(text: string) { return text.toLowerCase().split(/[^\p{L}\p{N}.:+/_-]+/u).filter((x) => x.length > 1); }

export async function searchFreeLlmCatalog(query: string, limit = 12) {
  const catalog = await getFreeLlmCatalog(true);
  const q = tokens(query);
  const scored = catalog.providers.flatMap((provider) => {
    const providerText = `${provider.name} ${provider.notes.join(" ")}`.toLowerCase();
    const providerScore = q.reduce((score, token) => score + (providerText.includes(token) ? 4 : 0), 0);
    const models = provider.models.map((model) => {
      const lower = model.toLowerCase();
      const score = providerScore + q.reduce((sum, token) => sum + (lower.includes(token) ? 8 : 0), 0) + (provider.access === "free" ? 1 : 0);
      return { provider: provider.name, url: provider.url, access: provider.access, model, notes: provider.notes, score };
    });
    if (!models.length && providerScore > 0) return [{ provider: provider.name, url: provider.url, access: provider.access, model: "(provider catalog)", notes: provider.notes, score: providerScore }];
    return models;
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.provider.localeCompare(b.provider)).slice(0, Math.max(1, limit));
  return { syncedAt: catalog.syncedAt, providerCount: catalog.providers.length, results: scored };
}
