import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { jarvisConfig } from "./config";

const ignoredDirs = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".idea", ".vscode"]);
const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".txt", ".css", ".scss", ".html",
  ".yml", ".yaml", ".toml", ".sql", ".py", ".ps1", ".sh", ".example", ".mq5", ".mqh", ".dart", ".java",
  ".kt", ".kts", ".go", ".rs", ".php", ".rb", ".cs", ".xml", ".gradle", ".properties",
]);

const sensitiveNames = [
  /^\.env(?:\.|$)/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^credentials(?:\.|$)/i,
  /^secrets?(?:\.|$)/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i,
  /service[-_]?account.*\.json$/i,
];

export type ProjectFile = {
  path: string;
  size: number;
  ext: string;
};

export type ProjectIndex = {
  generatedAt: string;
  workspace: string;
  fileCount: number;
  totalBytes: number;
  extensions: Record<string, number>;
  stack: string[];
  scripts: Record<string, string>;
  keyFiles: string[];
  files: ProjectFile[];
};

function rootPath() {
  return path.resolve(jarvisConfig.workspacePath);
}

function relative(target: string) {
  return path.relative(rootPath(), target).replace(/\\/g, "/") || ".";
}

function isSensitive(file: string) {
  const name = path.basename(file);
  if (name === ".env.example" || name.endsWith(".example")) return false;
  return sensitiveNames.some((pattern) => pattern.test(name));
}

function isTextLike(file: string) {
  return textExtensions.has(path.extname(file).toLowerCase()) || path.basename(file).endsWith(".example");
}

async function walk(dir: string, out: ProjectFile[]) {
  if (out.length >= jarvisConfig.maxIndexFiles) return;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= jarvisConfig.maxIndexFiles) return;
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!entry.isFile() || isSensitive(full)) continue;
    try {
      const stat = await fs.stat(full);
      out.push({ path: relative(full), size: stat.size, ext: path.extname(entry.name).toLowerCase() || "(none)" });
    } catch {
      // Ignore files that disappear during indexing.
    }
  }
}

async function tryRead(relativePath: string) {
  try {
    const target = path.join(rootPath(), relativePath);
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > jarvisConfig.maxReadBytes || isSensitive(target)) return null;
    const raw = await fs.readFile(target);
    if (raw.includes(0)) return null;
    return raw.toString("utf8");
  } catch {
    return null;
  }
}

function detectStack(files: ProjectFile[], pkg: Record<string, unknown> | null, pubspec: string | null) {
  const stack = new Set<string>();
  const deps = new Set<string>();
  if (pkg) {
    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      const value = pkg[section];
      if (value && typeof value === "object") Object.keys(value as Record<string, unknown>).forEach((name) => deps.add(name));
    }
  }
  if (deps.has("next")) stack.add("Next.js");
  if (deps.has("react")) stack.add("React");
  if (deps.has("@supabase/supabase-js")) stack.add("Supabase");
  if (deps.has("prisma") || deps.has("@prisma/client")) stack.add("Prisma");
  if (deps.has("fastify")) stack.add("Fastify");
  if (deps.has("express")) stack.add("Express");
  if (deps.has("typescript")) stack.add("TypeScript");
  if (deps.has("tailwindcss")) stack.add("Tailwind CSS");
  if (pubspec?.includes("sdk: flutter")) stack.add("Flutter");
  if (files.some((f) => f.ext === ".dart")) stack.add("Dart");
  if (files.some((f) => f.ext === ".py")) stack.add("Python");
  if (files.some((f) => f.ext === ".mq5" || f.ext === ".mqh")) stack.add("MQL5");
  if (files.some((f) => f.ext === ".sql")) stack.add("SQL");
  if (files.some((f) => f.ext === ".go")) stack.add("Go");
  if (files.some((f) => f.ext === ".rs")) stack.add("Rust");
  if (files.some((f) => f.path.endsWith("docker-compose.yml") || f.path.endsWith("Dockerfile"))) stack.add("Docker");
  return [...stack];
}

export async function buildProjectIndex(): Promise<ProjectIndex> {
  const files: ProjectFile[] = [];
  await walk(rootPath(), files);

  const extensions: Record<string, number> = {};
  let totalBytes = 0;
  for (const file of files) {
    extensions[file.ext] = (extensions[file.ext] || 0) + 1;
    totalBytes += file.size;
  }

  const packageRaw = await tryRead("package.json");
  let pkg: Record<string, unknown> | null = null;
  if (packageRaw) {
    try { pkg = JSON.parse(packageRaw) as Record<string, unknown>; } catch { pkg = null; }
  }
  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts as Record<string, string> : {};
  const pubspec = await tryRead("pubspec.yaml");
  const keyCandidates = [
    "package.json", "tsconfig.json", "next.config.ts", "next.config.js", "pubspec.yaml", "pyproject.toml", "requirements.txt",
    "README.md", "docker-compose.yml", "Dockerfile", "prisma/schema.prisma", "supabase/config.toml",
  ];
  const present = new Set(files.map((f) => f.path));
  const keyFiles = keyCandidates.filter((file) => present.has(file));

  return {
    generatedAt: new Date().toISOString(),
    workspace: rootPath(),
    fileCount: files.length,
    totalBytes,
    extensions,
    stack: detectStack(files, pkg, pubspec),
    scripts,
    keyFiles,
    files,
  };
}

function tokenize(input: string) {
  return [...new Set((input.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || []).filter((token) => token.length >= 2))].slice(0, 20);
}

export async function retrieveProjectContext(query: string, limit = 8) {
  const index = await buildProjectIndex();
  const tokens = tokenize(query);
  if (!tokens.length) throw new Error("Query must contain searchable words.");
  const candidates: Array<{ path: string; score: number; snippets: string[] }> = [];

  for (const file of index.files) {
    if (!isTextLike(file.path) || file.size > jarvisConfig.maxReadBytes) continue;
    const pathLower = file.path.toLowerCase();
    let score = tokens.reduce((sum, token) => sum + (pathLower.includes(token) ? 8 : 0), 0);
    let content = "";
    try {
      content = await fs.readFile(path.join(rootPath(), file.path), "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    const snippets: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const lower = lines[i].toLowerCase();
      const hits = tokens.filter((token) => lower.includes(token)).length;
      if (!hits) continue;
      score += hits * 3;
      if (snippets.length < 6) snippets.push(`${i + 1}: ${lines[i].trim().slice(0, 500)}`);
    }
    if (score > 0) {
      if (!snippets.length) snippets.push(...lines.slice(0, 12).map((line, i) => `${i + 1}: ${line.trim().slice(0, 500)}`));
      candidates.push({ path: file.path, score, snippets });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { query, tokens, results: candidates.slice(0, Math.max(1, Math.min(limit, 12))), scannedFiles: index.fileCount };
}

type Finding = { severity: "high" | "warning" | "info"; path: string; line?: number; issue: string };

export async function reviewProject() {
  const index = await buildProjectIndex();
  const findings: Finding[] = [];
  const maxFindings = 80;

  for (const file of index.files) {
    if (findings.length >= maxFindings) break;
    if (!isTextLike(file.path) || file.size > jarvisConfig.maxReadBytes) continue;
    let content = "";
    try { content = await fs.readFile(path.join(rootPath(), file.path), "utf8"); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length && findings.length < maxFindings; i += 1) {
      const line = lines[i];
      const lineNo = i + 1;
      if (/\beval\s*\(/.test(line)) findings.push({ severity: "high", path: file.path, line: lineNo, issue: "Dynamic eval() detected; review for code-injection risk." });
      if (/dangerouslySetInnerHTML/.test(line)) findings.push({ severity: "warning", path: file.path, line: lineNo, issue: "dangerouslySetInnerHTML detected; ensure input is trusted/sanitized." });
      if (/from\s+["']node:child_process["']|require\(["']child_process["']\)/.test(line)) findings.push({ severity: "warning", path: file.path, line: lineNo, issue: "child_process usage detected; verify strict argument allow-lists." });
      if (/\b(TODO|FIXME|HACK)\b/.test(line)) findings.push({ severity: "info", path: file.path, line: lineNo, issue: "Unresolved TODO/FIXME/HACK marker." });
      if (/console\.(log|debug)\s*\(/.test(line) && /(?:src|app|lib|components)\//.test(file.path)) findings.push({ severity: "info", path: file.path, line: lineNo, issue: "Debug console output remains in application source." });
      if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(line) && /(?:src\/components|src\/app\/[^/]+\.tsx|public\/)/.test(file.path)) {
        findings.push({ severity: "high", path: file.path, line: lineNo, issue: "Possible privileged Supabase credential/reference in client-facing code." });
      }
    }
  }

  const packageJson = await tryRead("package.json");
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> };
      if (!pkg.scripts?.build) findings.push({ severity: "warning", path: "package.json", issue: "No build script detected." });
      if (!pkg.scripts?.lint && !pkg.scripts?.typecheck && !pkg.scripts?.test) findings.push({ severity: "info", path: "package.json", issue: "No lint/typecheck/test script detected." });
    } catch {
      findings.push({ severity: "high", path: "package.json", issue: "package.json is not valid JSON." });
    }
  }

  const counts = findings.reduce((acc, item) => {
    acc[item.severity] += 1;
    return acc;
  }, { high: 0, warning: 0, info: 0 });

  return { index, counts, findings };
}
