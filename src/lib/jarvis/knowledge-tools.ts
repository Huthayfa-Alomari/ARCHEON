import { ingestLocalBook, ingestOpenBookUrl } from "./book-ingest";
import { fredSeries, huggingFaceDatasetSample, huggingFaceDatasetSearch, kaggleSearch, openAlexWorks, secCompanyFacts, worldBankIndicator } from "./knowledge-connectors";
import { ingestKnowledgeText, knowledgeStats, searchKnowledge } from "./knowledge-store";
import type { ToolCall, ToolExecutionResult } from "./types";
import { ingestTradingLibraryBook, listTradingLibrary } from "./trading-library";
import { ingestKaggleDatasetFile } from "./kaggle-ingest";

function s(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function n(v: unknown, fallback: number, min: number, max: number) { const x = Number(v); return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.trunc(x))) : fallback; }
function tags(v: unknown) { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []; }
function compact(value: unknown, max = 22_000) { const t = typeof value === "string" ? value : JSON.stringify(value, null, 2); return t.length > max ? `${t.slice(0, max)}\n…[truncated]` : t; }

export async function prepareKnowledgeApproval(call: ToolCall): Promise<{ call: ToolCall; preview?: string } | null> {
  if (call.tool === "knowledge.book.ingestLocal") {
    const p = s(call.args.path); if (!p) throw new Error("path is required.");
    return { call, preview: `INDEX LOCAL BOOK\nPath: ${p}\nLicense: ${s(call.args.license) || "user-provided/authorized"}\n\nThe source will be chunked into the local Knowledge Store. It is not used to retrain model weights.` };
  }
  if (call.tool === "knowledge.book.ingestUrl") {
    const url = s(call.args.url); if (!url) throw new Error("url is required.");
    return { call, preview: `INDEX OPEN BOOK URL\n${url}\nLicense: ${s(call.args.license) || "Project Gutenberg/public-domain status"}\n\nOnly text content is indexed; secrets are redacted.` };
  }
  if (call.tool === "knowledge.tradingLibrary.ingest") {
    const id = s(call.args.id); if (!id) throw new Error("id is required.");
    return { call, preview: `INDEX CURATED TRADING BOOK\nID: ${id}\n\nJARVIS will fetch the Project Gutenberg text only after approval, then chunk it locally with provenance metadata.` };
  }
  if (call.tool === "knowledge.kaggle.ingestFile") {
    const dataset = s(call.args.dataset); const file = s(call.args.file);
    if (!dataset || !file) throw new Error("dataset and file are required.");
    return { call, preview: `INDEX KAGGLE DATASET FILE\nDataset: ${dataset}\nFile: ${file}\nLicense: ${s(call.args.license) || "See Kaggle dataset license"}\n\nJARVIS will use the official Kaggle CLI to download only this file, enforce the local size/type limits, index it with provenance, then delete the temporary copy.` };
  }
  if (call.tool === "knowledge.hf.ingestSample") {
    const dataset = s(call.args.dataset); if (!dataset) throw new Error("dataset is required.");
    return { call, preview: `INDEX HUGGING FACE DATASET SAMPLE\nDataset: ${dataset}\nRows: ${n(call.args.length, 50, 1, 100)}\n\nOnly the selected Dataset Viewer sample plus schema metadata will be persisted, with provenance. This is not model-weight training.` };
  }
  if (call.tool === "knowledge.promoteText") {
    const content = s(call.args.content); if (content.length < 80) throw new Error("content must be at least 80 characters.");
    return { call, preview: `ADD KNOWLEDGE SOURCE\nTitle: ${s(call.args.title) || "Untitled"}\nSource: ${s(call.args.sourceRef) || "manual"}\nLicense: ${s(call.args.license) || "unspecified"}\n\n${content.slice(0, 3000)}` };
  }
  return null;
}

export async function executeKnowledgeTool(call: ToolCall): Promise<ToolExecutionResult | null> {
  switch (call.tool) {
    case "knowledge.search": {
      const q = s(call.args.query); if (!q) throw new Error("query is required.");
      const rows = await searchKnowledge(q, n(call.args.limit, 8, 1, 20));
      return { ok: true, tool: call.tool, summary: rows.length ? rows.map((x, i) => `${i + 1}. [${x.sourceKind} trust=${x.trust.toFixed(2)}] ${x.title}\n${x.sourceRef}\n${x.content.slice(0, 1800)}`).join("\n\n") : `No indexed knowledge matched “${q}”.`, data: rows };
    }
    case "knowledge.stats": {
      const out = await knowledgeStats(); return { ok: true, tool: call.tool, summary: JSON.stringify(out, null, 2), data: out };
    }
    case "knowledge.kaggle.search": {
      const q = s(call.args.query); if (!q) throw new Error("query is required.");
      const out = await kaggleSearch(q, n(call.args.page, 1, 1, 100));
      return { ok: true, tool: call.tool, summary: compact(out), data: out };
    }
    case "knowledge.kaggle.ingestFile": {
      const dataset = s(call.args.dataset); const file = s(call.args.file);
      if (!dataset || !file) throw new Error("dataset and file are required.");
      const out = await ingestKaggleDatasetFile({ dataset, file, license: s(call.args.license) || undefined, tags: tags(call.args.tags) });
      return { ok: true, tool: call.tool, summary: `Indexed Kaggle ${dataset}/${file}: ${out.added} new chunks, ${out.skipped} duplicates, ${out.bytes} bytes.`, data: out };
    }
    case "knowledge.hf.search": {
      const q = s(call.args.query); if (!q) throw new Error("query is required.");
      const out = await huggingFaceDatasetSearch(q, n(call.args.limit, 12, 1, 50));
      return { ok: true, tool: call.tool, summary: compact(out), data: out };
    }
    case "knowledge.hf.ingestSample": {
      const dataset = s(call.args.dataset); if (!dataset) throw new Error("dataset is required.");
      const sample = await huggingFaceDatasetSample(dataset, n(call.args.length, 50, 1, 100), s(call.args.config) || undefined, s(call.args.split) || undefined);
      const payload = JSON.stringify(sample.rows, null, 2);
      const out = await ingestKnowledgeText({ title: `Hugging Face dataset sample: ${dataset}`, sourceRef: `https://huggingface.co/datasets/${dataset}#${sample.config}/${sample.split}`, sourceKind: "dataset", text: payload, license: s(call.args.license) || "See dataset card/license", tags: ["dataset", "huggingface", ...tags(call.args.tags)], trust: 0.72 });
      return { ok: true, tool: call.tool, summary: `Indexed ${dataset} sample (${sample.config}/${sample.split}): ${out.added} chunks, ${out.skipped} duplicates.`, data: { sample: { dataset, config: sample.config, split: sample.split }, ingest: out } };
    }
    case "knowledge.worldbank.indicator": {
      const indicator = s(call.args.indicator); if (!indicator) throw new Error("indicator is required.");
      const out = await worldBankIndicator(indicator, s(call.args.country) || "all", s(call.args.date) || undefined);
      return { ok: true, tool: call.tool, summary: compact(out), data: out };
    }
    case "knowledge.fred.series": {
      const id = s(call.args.seriesId); if (!id) throw new Error("seriesId is required.");
      const out = await fredSeries(id, s(call.args.observationStart) || undefined);
      return { ok: true, tool: call.tool, summary: compact(out), data: out };
    }
    case "knowledge.sec.companyFacts": {
      const cik = s(call.args.cik); if (!cik) throw new Error("cik is required.");
      const out = await secCompanyFacts(cik); return { ok: true, tool: call.tool, summary: compact(out), data: out };
    }
    case "knowledge.openalex.search": {
      const q = s(call.args.query); if (!q) throw new Error("query is required.");
      const out = await openAlexWorks(q, n(call.args.limit, 12, 1, 50));
      return { ok: true, tool: call.tool, summary: compact(out), data: out };
    }
    case "knowledge.book.ingestLocal": {
      const out = await ingestLocalBook({ path: s(call.args.path), title: s(call.args.title) || undefined, license: s(call.args.license) || undefined, tags: tags(call.args.tags) });
      return { ok: true, tool: call.tool, summary: `Indexed local book: ${out.added} new chunks, ${out.skipped} duplicates, source=${out.sourceId}.`, data: out };
    }
    case "knowledge.book.ingestUrl": {
      const out = await ingestOpenBookUrl({ url: s(call.args.url), title: s(call.args.title) || undefined, license: s(call.args.license) || undefined, tags: tags(call.args.tags) });
      return { ok: true, tool: call.tool, summary: `Indexed open book: ${out.added} new chunks, ${out.skipped} duplicates, source=${out.sourceId}.`, data: out };
    }
    case "knowledge.tradingLibrary.list": {
      const out = await listTradingLibrary();
      return { ok: true, tool: call.tool, summary: out.books.map((b) => `${b.id} — ${b.title} — ${b.author} (${b.year})\n${b.landing}\n${b.license}`).join("\n\n"), data: out };
    }
    case "knowledge.tradingLibrary.ingest": {
      const out = await ingestTradingLibraryBook(s(call.args.id));
      return { ok: true, tool: call.tool, summary: `Indexed ${out.book.title}: ${out.result.added} new chunks, ${out.result.skipped} duplicates.`, data: out };
    }
    case "knowledge.promoteText": {
      const out = await ingestKnowledgeText({ title: s(call.args.title) || "Manual knowledge", sourceRef: s(call.args.sourceRef) || "manual", sourceKind: (s(call.args.sourceKind) || "web") as "book"|"dataset"|"paper"|"api"|"local"|"web", text: s(call.args.content), license: s(call.args.license) || undefined, tags: tags(call.args.tags), trust: Number(call.args.trust ?? 0.7) });
      return { ok: true, tool: call.tool, summary: `Added knowledge source: ${out.added} chunks (${out.skipped} duplicates).`, data: out };
    }
    default: return null;
  }
}
