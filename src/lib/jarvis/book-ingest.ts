import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { jarvisConfig } from "./config";
import { safeFetchText } from "./safe-net";
import { ingestKnowledgeText } from "./knowledge-store";

const execFileAsync = promisify(execFile);
const allowedTextExt = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".jsonl", ".tsv"]);

function resolveLocal(input: string) {
  const root = path.resolve(jarvisConfig.workspacePath);
  const target = path.resolve(root, input);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Book path must stay inside JARVIS workspace.");
  return target;
}

export async function ingestLocalBook(args: { path: string; title?: string; license?: string; tags?: string[] }) {
  const target = resolveLocal(args.path);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error("Book path is not a file.");
  if (stat.size > jarvisConfig.maxKnowledgeFileBytes) throw new Error(`Book exceeds JARVIS_MAX_KNOWLEDGE_FILE_BYTES (${jarvisConfig.maxKnowledgeFileBytes}).`);
  const ext = path.extname(target).toLowerCase();
  let text = "";
  if (allowedTextExt.has(ext)) {
    text = await fs.readFile(target, "utf8");
  } else if (ext === ".pdf") {
    try {
      const { stdout } = await execFileAsync("pdftotext", ["-layout", target, "-"], { timeout: 60_000, maxBuffer: jarvisConfig.maxKnowledgeFileBytes * 2, windowsHide: true });
      text = stdout;
    } catch {
      throw new Error("PDF ingestion requires the local `pdftotext` utility (Poppler). Convert the book to TXT/Markdown or install Poppler.");
    }
  } else {
    throw new Error("Supported book formats: TXT, Markdown, CSV/TSV, JSON/JSONL, PDF (via pdftotext).");
  }
  return ingestKnowledgeText({
    title: args.title || path.basename(target), sourceRef: `local:${path.relative(jarvisConfig.workspacePath, target)}`,
    sourceKind: "book", text, license: args.license || "user-provided/authorized", tags: ["trading", "book", ...(args.tags || [])], trust: 0.82,
  });
}

export async function ingestOpenBookUrl(args: { url: string; title?: string; license?: string; tags?: string[] }) {
  const u = new URL(args.url);
  const isGutenberg = u.hostname === "www.gutenberg.org" || u.hostname === "gutenberg.org" || u.hostname.endsWith(".gutenberg.org");
  if (!isGutenberg && !args.license) throw new Error("For non-Project-Gutenberg URLs you must supply an explicit open/public license label.");
  const result = await safeFetchText(args.url, { maxBytes: jarvisConfig.maxKnowledgeFileBytes });
  return ingestKnowledgeText({
    title: args.title || u.pathname.split("/").filter(Boolean).pop() || "Open book",
    sourceRef: result.url, sourceKind: "book", text: result.text,
    license: args.license || "Project Gutenberg / public-domain status varies by jurisdiction",
    tags: ["trading", "book", ...(args.tags || [])], trust: isGutenberg ? 0.8 : 0.72,
  });
}
