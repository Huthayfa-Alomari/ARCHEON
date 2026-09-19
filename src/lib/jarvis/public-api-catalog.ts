import fs from "node:fs/promises";
import path from "node:path";
import { jarvisConfig } from "./config";
import { safeFetchText } from "./safe-net";

export type PublicApiEntry = {
  name: string;
  url: string;
  description: string;
  auth: string;
  https: string;
  cors: string;
  category: string;
};

type Catalog = { source: string; syncedAt: string; entries: PublicApiEntry[] };
const SOURCE = "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md";

function catalogPath() { return path.resolve(process.cwd(), jarvisConfig.apiCatalogPath); }

function splitRow(line: string) {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const ch of body) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === "\\") { escaped = true; current += ch; continue; }
    if (ch === "|") { cells.push(current.trim().replace(/\\\|/g, "|")); current = ""; }
    else current += ch;
  }
  cells.push(current.trim().replace(/\\\|/g, "|"));
  return cells;
}

export function parsePublicApisReadme(markdown: string) {
  const entries: PublicApiEntry[] = [];
  let category = "Uncategorized";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^###\s+(.+?)\s*$/);
    if (heading) { category = heading[1].replace(/<[^>]+>/g, "").trim(); continue; }
    if (!rawLine.trim().startsWith("|")) continue;
    const cells = splitRow(rawLine);
    if (cells.length < 5 || /^api$/i.test(cells[0]) || /^[-: ]+$/.test(cells[0])) continue;
    const link = cells[0].match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
    if (!link) continue;
    const entry: PublicApiEntry = {
      name: link[1].trim(), url: link[2].trim(), description: (cells[1] || "").trim(),
      auth: (cells[2] || "").replace(/`/g, "").trim(), https: (cells[3] || "").trim(), cors: (cells[4] || "").trim(), category,
    };
    entries.push(entry);
  }
  return entries;
}

async function readCatalog(): Promise<Catalog | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(catalogPath(), "utf8")) as Catalog;
    if (!Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch { return null; }
}

async function writeCatalog(catalog: Catalog) {
  const target = catalogPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(catalog, null, 2), "utf8");
}

export async function syncPublicApiCatalog() {
  const fetched = await safeFetchText(SOURCE, { maxBytes: 1_200_000 });
  const entries = parsePublicApisReadme(fetched.text);
  if (entries.length < 100) throw new Error(`Parsed only ${entries.length} APIs; refusing to replace the catalog with an incomplete source.`);
  const catalog: Catalog = { source: SOURCE, syncedAt: new Date().toISOString(), entries };
  await writeCatalog(catalog);
  return catalog;
}

export async function getPublicApiCatalog(autoSync = true) {
  const catalog = await readCatalog();
  if (!autoSync) return catalog || ({ source: SOURCE, syncedAt: "", entries: [] } satisfies Catalog);

  const ageMs = catalog?.syncedAt ? Date.now() - Date.parse(catalog.syncedAt) : Number.POSITIVE_INFINITY;
  const stale = !catalog || !Number.isFinite(ageMs) || ageMs > jarvisConfig.apiCatalogRefreshHours * 60 * 60 * 1000;
  if (!stale && catalog) return catalog;
  try { return await syncPublicApiCatalog(); }
  catch (error) {
    if (catalog?.entries.length) return catalog;
    throw error;
  }
}

function tokenize(text: string) { return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1); }

export async function searchPublicApis(query: string, limit = 12) {
  const catalog = await getPublicApiCatalog(true);
  const q = tokenize(query);
  const scored = catalog.entries.map((entry) => {
    const name = entry.name.toLowerCase();
    const category = entry.category.toLowerCase();
    const desc = entry.description.toLowerCase();
    let score = 0;
    for (const token of q) {
      if (name.includes(token)) score += 8;
      if (category.includes(token)) score += 5;
      if (desc.includes(token)) score += 2;
    }
    if (/^yes$/i.test(entry.https)) score += 1.5;
    if (/^yes$/i.test(entry.cors)) score += 0.5;
    if (/^no$/i.test(entry.auth)) score += 0.5;
    return { entry, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name)).slice(0, Math.max(1, limit));
  return { syncedAt: catalog.syncedAt, total: catalog.entries.length, results: scored.map((x) => ({ ...x.entry, score: x.score })) };
}
