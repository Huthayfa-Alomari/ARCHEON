import os from "node:os";
import { recall, remember } from "./memory";
import { jarvisConfig } from "./config";
import type { ToolCall } from "./types";
import { TOOL_DEFINITIONS } from "./tool-registry";
import { learn, learningStats, searchLearned } from "./learning";
import { modelPerformanceSummary } from "./model-performance";
import { cognitiveMemoryStats } from "./cognitive-memory";
import { modelRouterStatus } from "./model-router";

export type BuiltInResult =
  | { handled: false }
  | { handled: true; response: string }
  | { handled: true; toolCall: ToolCall };

function call(tool: string, args: Record<string, unknown> = {}, reason?: string): BuiltInResult {
  return { handled: true, toolCall: { tool, args, reason } };
}

export async function tryBuiltInTool(message: string): Promise<BuiltInResult> {
  const text = message.trim();

  if (/^(\/time|الوقت|كم الساعة|كم الساعه)/i.test(text)) {
    return { handled: true, response: `الوقت الآن: ${new Date().toLocaleString("ar-JO", { timeZone: jarvisConfig.timezone })}` };
  }

  if (/^(\/status|حالة النظام|حاله النظام|system status)$/i.test(text)) {
    const freeMb = Math.round(os.freemem() / 1024 / 1024);
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    const stats = await learningStats();
    return { handled: true, response: [
      "ARCHEON Core v1.4 MISSION CONTROL + RESEARCH FACTORY يعمل.",
      `النظام: ${os.platform()} ${os.arch()}`,
      `الأنوية المنطقية: ${os.cpus().length}`,
      `الذاكرة الحرة: ${freeMb} MB من ${totalMb} MB`,
      `Workspace: ${jarvisConfig.workspacePath}`,
      `LLM: ${jarvisConfig.provider} / routing=${jarvisConfig.routingMode} / ${jarvisConfig.model || "adaptive"} / reasoning=${jarvisConfig.reasoningEffort}`,
      `Council: ${jarvisConfig.councilMode.toUpperCase()} / maxModels=${jarvisConfig.councilMaxModels === 0 ? "ALL" : jarvisConfig.councilMaxModels} / critique=${jarvisConfig.councilCritiqueRound ? "ON" : "OFF"}`,
      `Agent loop: حتى ${jarvisConfig.maxAgentSteps} خطوات`,
      `Self-learning: ${stats.enabled ? `ON (${stats.count} evidence records)` : "OFF"}`,
      `Secret files: ${jarvisConfig.allowSecretFiles ? "UNLOCKED" : "BLOCKED"}`,
      `OS Actions: ${jarvisConfig.enableOsActions ? "ENABLED (approval required)" : "DISABLED"}`,
    ].join("\n") };
  }

  const rememberMatch = text.match(/^(?:\/remember\s+|تذكر(?: أن| ان)?\s+)(.+)$/i);
  if (rememberMatch?.[1]) {
    const item = await remember(rememberMatch[1]);
    await learn(rememberMatch[1], "user", { sourceRef: "explicit-memory", reliability: 0.95 });
    return { handled: true, response: `تم حفظها في الذاكرة الصريحة: “${item.text}”` };
  }

  const learnMatch = text.match(/^\/learn\s+(.+)$/i);
  if (learnMatch?.[1]) {
    const item = await learn(learnMatch[1], "user", { sourceRef: "explicit-learning", reliability: 0.95 });
    return { handled: true, response: item ? `تم تسجيل المعرفة مع مصدرها في Learning Store: “${item.content}”` : "لم يتم تسجيل شيء." };
  }

  if (/^(\/memory|ماذا تتذكر|شو بتتذكر|اعرض الذاكرة)$/i.test(text)) {
    const notes = await recall();
    return { handled: true, response: notes.length ? `آخر الذاكرة الصريحة:\n${notes.map((n, i) => `${i + 1}. ${n.text}`).join("\n")}` : "الذاكرة الصريحة فارغة حاليًا." };
  }

  const knowledge = text.match(/^\/knowledge\s+(.+)$/i);
  if (knowledge) {
    const results = await searchLearned(knowledge[1], 10);
    return { handled: true, response: results.length ? results.map((r, i) => `${i + 1}. [${r.source} / ${r.reliability.toFixed(2)}] ${r.content}`).join("\n\n") : "لا توجد معرفة متعلمة مطابقة." };
  }



  if (/^\/reach(?:\s+doctor)?$/i.test(text)) return call("reach.doctor", {}, "Probe internet capability channels and active fallbacks.");
  if (/^\/agent-reach(?:\s+doctor)?$/i.test(text)) return call("reach.agentReach.doctor", {}, "Run upstream Agent-Reach doctor.");
  const reachWeb = text.match(/^\/web\s+(https:\/\/\S+)$/i);
  if (reachWeb) return call("reach.web.read", { url: reachWeb[1] }, "Read a public HTTPS page through Reach.");
  const reachSearch = text.match(/^\/search\s+(.+)$/i);
  if (reachSearch) return call("reach.search.exa", { query: reachSearch[1].trim(), limit: 8 }, "Semantic web search through Reach.");
  const reachGithub = text.match(/^\/gh-search\s+(.+)$/i);
  if (reachGithub) return call("reach.github.search", { query: reachGithub[1].trim(), limit: 10 }, "Search GitHub through Reach.");
  const yt = text.match(/^\/youtube\s+(https:\/\/\S+)$/i);
  if (yt) return call("reach.youtube.transcript", { url: yt[1] }, "Extract YouTube transcript through Reach.");
  const rss = text.match(/^\/rss\s+(https:\/\/\S+)$/i);
  if (rss) return call("reach.rss.read", { url: rss[1], limit: 15 }, "Read RSS/Atom through Reach.");
  if (/^\/command$/i.test(text)) return call("core.commandCenter.status", {}, "Show ARCHEON command center status.");
  if (/^\/missions$/i.test(text)) return call("core.mission.list", { limit: 50 }, "List persistent missions.");
  const missionStatus = text.match(/^\/mission\s+(mission_[\w-]+)$/i);
  if (missionStatus) return call("core.mission.status", { id: missionStatus[1] }, "Show one mission and ready tasks.");
  if (/^\/approvals$/i.test(text)) return call("core.approvals.list", {}, "Show pending approval inbox.");
  if (/^\/team$/i.test(text)) return call("core.team.catalog", {}, "Show specialized ARCHEON agent roles.");
  if (/^\/sandbox$/i.test(text)) return call("core.sandbox.status", {}, "Check Docker sandbox runtime.");
  if (/^\/plugins$/i.test(text)) return call("core.plugins.list", {}, "List registered plugins.");
  if (/^\/workers$/i.test(text)) return call("core.mesh.workers", {}, "List online distributed Device Mesh workers.");
  if (/^\/evals$/i.test(text)) return call("core.eval.run", {}, "Run ARCHEON core regression evaluations.");
  if (/^\/computer$/i.test(text)) return call("core.computer.status", {}, "Show safe computer-agent capabilities.");
  if (/^\/research\s+stats$/i.test(text)) return call("research.stats", {}, "Show Research Lab statistics.");
  if (/^\/factory\s+status$/i.test(text)) return call("research.factory.status", {}, "Show Autonomous Research Factory queue.");
  const factoryRun = text.match(/^\/factory\s+run(?:\s+(\d+))?$/i);
  if (factoryRun) return call("research.factory.run", { maxJobs: Number(factoryRun[1] || 20) }, "Process queued Research Factory jobs.");
  if (/^\/agentic-stack$/i.test(text)) return call("research.agenticStack.status", {}, "Show integrated agentic stack patterns and optional runtimes.");
  const regimes = text.match(/^\/regimes\s+(.+?)(?:\s+(\d+))?$/i);
  if (regimes) return call("research.regimes.analyze", { csvPath: regimes[1].trim(), window: Number(regimes[2] || 100) }, "Analyze market regimes for a local OHLC dataset.");
  if (/^\/hypotheses$/i.test(text)) return call("research.hypothesis.list", { limit: 50 }, "List research hypotheses.");
  if (/^\/mt5\s+status$/i.test(text)) return call("trading.mt5.status", {}, "Check MetaTrader 5 bridge status.");
  if (/^\/mt5\s+positions$/i.test(text)) return call("trading.mt5.positions", {}, "Read MetaTrader 5 positions.");
  const mt5bars = text.match(/^\/mt5\s+bars\s+(\S+)(?:\s+(\S+))?(?:\s+(\d+))?$/i);
  if (mt5bars) return call("trading.mt5.bars", { symbol: mt5bars[1], timeframe: mt5bars[2] || "M15", count: Number(mt5bars[3] || 500) }, "Read market bars from MT5.");
  if (/^\/trading\s+status$/i.test(text)) return call("trading.autopilot.status", {}, "Show trading permit.");
  const arm = text.match(/^\/trading\s+arm\s+(paper|live)(?:\s+(\d+))?$/i);
  if (arm) return call("trading.autopilot.arm", { mode: arm[1].toLowerCase(), minutes: Number(arm[2] || 60) }, "Arm bounded autonomous trading.");
  if (/^\/trading\s+(?:off|disarm|kill)$/i.test(text)) return call("trading.autopilot.disarm", {}, "Revoke autonomous trading permit.");
  const pubmed = text.match(/^\/pubmed\s+(.+)$/i);
  if (pubmed) return call("domain.pubmed.search", { query: pubmed[1].trim(), limit: 10 }, "Search PubMed evidence.");

  if (/^\/council\s+status$/i.test(text)) {
    const [cognitive, performance] = await Promise.all([cognitiveMemoryStats(), modelPerformanceSummary()]);
    const router = modelRouterStatus();
    return { handled: true, response: [
      `Council mode: ${jarvisConfig.councilMode}`,
      `Configured routes: ${router.configuredRoutes.length}`,
      `Models per council: ${jarvisConfig.councilMaxModels === 0 ? "ALL configured" : jarvisConfig.councilMaxModels}`,
      `Minimum models: ${jarvisConfig.councilMinModels}`,
      `Parallel calls: ${jarvisConfig.councilConcurrency}`,
      `Cross-examination: ${jarvisConfig.councilCritiqueRound ? "ON" : "OFF"}`,
      `Cognitive sessions: ${cognitive.sessions}`,
      `Performance profiles: ${performance.length}`,
      `Feedback: +${cognitive.goodFeedback} / -${cognitive.badFeedback}`,
    ].join("\n") };
  }

  if (/^\/performance$/i.test(text)) {
    const rows = await modelPerformanceSummary();
    if (!rows.length) return { handled: true, response: "لا توجد بيانات أداء كافية بعد. شغّل عدة أسئلة في Council Mode أولًا." };
    return { handled: true, response: rows.slice(0, 30).map((row) => {
      const tasks = Object.entries(row.tasks).map(([task, m]) => `${task}: success=${m.successRate} peer=${m.peerAgreement ?? "-"} latency=${m.avgLatencyMs}ms user=+${m.userGood}/-${m.userBad}`).join(" | ");
      return `${row.routeId} → ${tasks}`;
    }).join("\n") };
  }

  if (/^\/tools$/i.test(text)) return { handled: true, response: TOOL_DEFINITIONS.map((tool) => `${tool.risk === "approval" ? "🔐" : "✓"} ${tool.name} — ${tool.description}`).join("\n") };
  if (/^\/sync\s+apis$/i.test(text)) return call("api.catalog.sync", {}, "Refresh public API capability catalog.");
  const apis = text.match(/^\/apis\s+(.+)$/i);
  if (apis) return call("api.catalog.search", { query: apis[1].trim(), limit: 15 }, "Search public APIs for a capability.");
  if (/^\/api-skills$/i.test(text)) return call("api.skill.list", {}, "List learned API skills.");
  if (/^\/knowledge\s+stats$/i.test(text)) return call("knowledge.stats", {}, "Show Knowledge Fabric statistics.");
  const ksearch = text.match(/^\/knowledge\s+(?!stats$)(.+)$/i);
  if (ksearch) return call("knowledge.search", { query: ksearch[1].trim(), limit: 10 }, "Search indexed books, datasets and research knowledge.");
  const kaggle = text.match(/^\/kaggle\s+(.+)$/i);
  if (kaggle) return call("knowledge.kaggle.search", { query: kaggle[1].trim(), page: 1 }, "Search Kaggle datasets.");
  const kaggleIngest = text.match(/^\/kaggle-ingest\s+(\S+)\s+(\S+)(?:\s+(.+))?$/i);
  if (kaggleIngest) return call("knowledge.kaggle.ingestFile", { dataset: kaggleIngest[1], file: kaggleIngest[2], license: kaggleIngest[3]?.trim() || undefined, tags: ["dataset"] }, "Index one selected Kaggle dataset file into Knowledge Fabric.");
  const hf = text.match(/^\/(?:hf|huggingface)\s+(.+)$/i);
  if (hf) return call("knowledge.hf.search", { query: hf[1].trim(), limit: 12 }, "Search Hugging Face datasets.");
  const hfIngest = text.match(/^\/hf-ingest\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?$/i);
  if (hfIngest) return call("knowledge.hf.ingestSample", { dataset: hfIngest[1], config: hfIngest[2], split: hfIngest[3], length: 50 }, "Index a bounded Hugging Face dataset sample into Knowledge Fabric.");
  const wb = text.match(/^\/worldbank\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?$/i);
  if (wb) return call("knowledge.worldbank.indicator", { indicator: wb[1], country: wb[2] || "all", date: wb[3] }, "Read World Bank indicator data.");
  const fred = text.match(/^\/fred\s+(\S+)(?:\s+(\S+))?$/i);
  if (fred) return call("knowledge.fred.series", { seriesId: fred[1], observationStart: fred[2] }, "Read FRED series data.");
  const sec = text.match(/^\/sec\s+(\d+)$/i);
  if (sec) return call("knowledge.sec.companyFacts", { cik: sec[1] }, "Read SEC EDGAR company facts.");
  const oa = text.match(/^\/papers\s+(.+)$/i);
  if (oa) return call("knowledge.openalex.search", { query: oa[1].trim(), limit: 12 }, "Search open-access research papers.");
  const book = text.match(/^\/ingest-book\s+(.+)$/i);
  if (book) return call("knowledge.book.ingestLocal", { path: book[1].trim(), license: "user-provided/authorized", tags: ["trading"] }, "Index an authorized local book into Knowledge Fabric.");
  if (/^\/trading-library$/i.test(text)) return call("knowledge.tradingLibrary.list", {}, "List curated open/public-domain trading books.");
  const libBook = text.match(/^\/ingest-trading-book\s+(.+)$/i);
  if (libBook) return call("knowledge.tradingLibrary.ingest", { id: libBook[1].trim() }, "Index one curated trading book into Knowledge Fabric.");
  if (/^\/sync\s+llms$/i.test(text)) return call("llm.resources.sync", {}, "Refresh free/trial LLM resource catalog.");
  const llms = text.match(/^\/llms\s+(.+)$/i);
  if (llms) return call("llm.resources.search", { query: llms[1].trim(), limit: 15 }, "Search free/trial LLM resources.");
  if (/^\/models$/i.test(text)) return call("llm.models", {}, "Show configured model fleet.");
  if (/^\/devices$/i.test(text)) return call("device.list", {}, "List paired Device Mesh nodes.");
  if (/^\/mesh$/i.test(text)) return call("device.mesh.status", {}, "Show Device Mesh status.");
  if (/^\/permissions$/i.test(text)) return call("device.permission.list", {}, "Show Device Mesh permission grants and requests.");
  if (/^\/capabilities$/i.test(text)) return call("device.permission.catalog", {}, "Show Device Mesh capability catalog.");
  const pair = text.match(/^\/pair(?:\s+(.+))?$/i);
  if (pair) return call("device.pair.start", { label: pair[1]?.trim() || "Android Companion" }, "Start a short-lived device pairing flow.");
  const health = text.match(/^\/health(?:\s+(.+))?$/i);
  if (health) return call("health.latest", { types: health[1] ? health[1].split(/[ ,]+/).filter(Boolean) : undefined, limit: 20 }, "Read encrypted Health Vault samples without sending them to the model council.");
  if (/^\/browser\s+status$/i.test(text)) return call("browser.skill.status", {}, "Check BrowserSkill readiness.");
  if (/^\/browser\s+authorize$/i.test(text)) return call("device.permission.grant", { deviceId: "local:browser-skill", capabilities: ["browser.observe", "browser.navigate", "browser.interact", "browser.borrow_user_tab"], ttlMinutes: 480, reason: "Owner-authorized BrowserSkill session capabilities" }, "Grant scoped BrowserSkill capabilities for 8 hours.");
  const route = text.match(/^\/route\s+(.+)$/i);
  if (route) return call("llm.route", { query: route[1].trim(), limit: 8 }, "Explain adaptive model routing for a task.");

  const files = text.match(/^\/files(?:\s+(.+))?$/i);
  if (files) return call("workspace.list", { path: files[1]?.trim() || "." }, "User requested workspace listing.");
  const read = text.match(/^\/read\s+(.+)$/i);
  if (read) return call("workspace.read", { path: read[1].trim() }, "User requested a workspace file.");
  const find = text.match(/^\/find\s+(.+?)(?:\s+--path\s+(.+))?$/i);
  if (find) return call("workspace.search", { query: find[1].trim(), path: find[2]?.trim() || "." }, "User requested workspace search.");
  if (/^\/index$/i.test(text)) return call("project.index", {}, "Build a structural index of the configured project.");
  if (/^\/review$/i.test(text)) return call("project.review", {}, "Run a read-only project review.");
  const context = text.match(/^\/context\s+(.+)$/i);
  if (context) return call("project.retrieve", { query: context[1].trim(), limit: 8 }, "Retrieve project context.");
  if (/^\/git\s+status$/i.test(text)) return call("git.status", {}, "Read git status.");
  if (/^\/git\s+diff$/i.test(text)) return call("git.diff", {}, "Read git diff.");
  const check = text.match(/^\/check\s+(build|lint|typecheck|test)$/i);
  if (check) return call("project.check", { script: check[1].toLowerCase() }, "Run an approved project check.");

  return { handled: false };
}
