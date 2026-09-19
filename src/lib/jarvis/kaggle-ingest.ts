import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { jarvisConfig } from "./config";
import { ingestKnowledgeText } from "./knowledge-store";

const execFileAsync = promisify(execFile);
const textExtensions = new Set([".csv", ".tsv", ".json", ".jsonl", ".txt", ".md"]);

function assertDatasetHandle(value: string) {
  const handle = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/\d+)?$/.test(handle)) {
    throw new Error("Kaggle dataset must be owner/dataset or owner/dataset/version.");
  }
  return handle;
}

function assertDatasetFile(value: string) {
  const file = value.replace(/\\/g, "/").trim();
  if (!file || file.startsWith("/") || file.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("Kaggle file must be a safe relative path inside the dataset.");
  }
  const ext = path.extname(file).toLowerCase();
  if (!textExtensions.has(ext)) {
    throw new Error(`Unsupported Kaggle file type ${ext || "(none)"}. Use CSV, TSV, JSON, JSONL, TXT, or MD.`);
  }
  return file;
}

export async function ingestKaggleDatasetFile(input: {
  dataset: string;
  file: string;
  license?: string;
  tags?: string[];
}) {
  const dataset = assertDatasetHandle(input.dataset);
  const file = assertDatasetFile(input.file);
  const token = jarvisConfig.kaggleToken;
  if (!token) throw new Error("KAGGLE_API_TOKEN is not configured in .env.local.");

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-kaggle-"));
  try {
    try {
      await execFileAsync("kaggle", ["datasets", "download", dataset, "-f", file, "-p", temp, "--unzip", "-q", "-o"], {
        env: { ...process.env, KAGGLE_API_TOKEN: token },
        timeout: 120_000,
        maxBuffer: 1_000_000,
        windowsHide: true,
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        throw new Error("Kaggle CLI is not installed or not on PATH. Install Python 3.11+ and run: py -m pip install -U kaggle");
      }
      throw error;
    }

    const target = path.resolve(temp, file);
    const root = path.resolve(temp) + path.sep;
    if (!target.startsWith(root)) throw new Error("Unsafe Kaggle output path.");
    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Kaggle CLI completed but ${file} was not found in the download output.`);
    if (stat.size > jarvisConfig.maxKnowledgeFileBytes) {
      throw new Error(`Kaggle file is ${stat.size} bytes; Knowledge Fabric limit is ${jarvisConfig.maxKnowledgeFileBytes} bytes.`);
    }

    const text = await fs.readFile(target, "utf8");
    const result = await ingestKnowledgeText({
      title: `Kaggle dataset: ${dataset} / ${file}`,
      sourceRef: `https://www.kaggle.com/datasets/${dataset.split("/").slice(0, 2).join("/")}`,
      sourceKind: "dataset",
      text,
      license: input.license?.trim() || "See Kaggle dataset license",
      tags: ["dataset", "kaggle", ...(input.tags || []).slice(0, 20)],
      trust: 0.72,
    });
    return { dataset, file, bytes: stat.size, ...result };
  } finally {
    await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}
