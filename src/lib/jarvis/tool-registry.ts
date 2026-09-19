import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { jarvisConfig } from "./config";
import { audit } from "./audit";
import { buildProjectIndex, retrieveProjectContext, reviewProject } from "./project-intelligence";
import type { ToolCall, ToolExecutionResult, ToolRisk } from "./types";
import { safeFetchText } from "./safe-net";
import { searchPublicApis, syncPublicApiCatalog } from "./public-api-catalog";
import { listApiSkills, registerApiSkill, runApiSkill, validateApiSkill } from "./api-skills";
import { learningStats, searchLearned } from "./learning";
import { searchFreeLlmCatalog, syncFreeLlmCatalog } from "./free-llm-catalog";
import { modelRouterStatus, routeModels } from "./model-router";
import { deviceTool, prepareDeviceApproval } from "./device-tools";
import { executeKnowledgeTool, prepareKnowledgeApproval } from "./knowledge-tools";
import { executeResearchTool } from "./research/tools";
import { executeTradingTool } from "./trading/tools";
import { executeDomainTool } from "./domains/tools";
import { telegramSend } from "./telegram";
import { executeReachTool } from "./reach/tools";
import { traceEvent } from "./tracing";
import { executeCoreTool } from "./core/tools";
import { securityState } from "./core/security-state";

const execFileAsync = promisify(execFile);

export type ToolDefinition = {
  name: string;
  risk: ToolRisk;
  description: string;
  args: string;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "core.mission.create", risk: "approval", description: "Create a persistent mission with objective, constraints, success metrics and a validated task DAG.", args: '{"title":"...","objective":"...","tasks":[{"title":"...","dependsOn":[0]}]}' },
  { name: "core.mission.list", risk: "read", description: "List persistent ARCHEON missions.", args: '{"limit":50}' },
  { name: "core.mission.status", risk: "read", description: "Show mission progress and dependency-ready tasks.", args: '{"id":"mission_..."}' },
  { name: "core.mission.task.update", risk: "approval", description: "Update a mission task state; dependency gates are enforced.", args: '{"missionId":"...","taskId":"...","status":"running|blocked|done|failed","result":"optional"}' },
  { name: "core.memory.remember", risk: "approval", description: "Persist a typed Memory 2.0 item: episodic, semantic, procedural, project, preference, failure or evidence.", args: '{"kind":"semantic","content":"...","tags":["..."],"confidence":0.8}' },
  { name: "core.memory.search", risk: "read", description: "Search typed Memory 2.0 with confidence and reinforcement signals.", args: '{"query":"...","limit":12,"kinds":["project"]}' },
  { name: "core.memory.consolidate", risk: "read", description: "Identify related memory groups that are candidates for later consolidation; does not silently delete memories.", args: '{}' },
  { name: "core.team.catalog", risk: "read", description: "List specialized ARCHEON agent roles and their default scoped tools.", args: '{}' },
  { name: "core.team.plan", risk: "read", description: "Build a role/handoff plan for a multi-agent objective without granting extra permissions.", args: '{"objective":"...","roles":["architect","coder","qa"]}' },
  { name: "core.eval.run", risk: "read", description: "Run deterministic core safety/catalog regression checks.", args: '{}' },
  { name: "core.sandbox.status", risk: "read", description: "Probe the local Docker sandbox runtime.", args: '{}' },
  { name: "core.sandbox.run", risk: "approval", description: "Run bounded Python or Node code inside a no-network, memory/CPU/PID-limited read-only Docker sandbox.", args: '{"language":"python|node","code":"...","timeoutSeconds":20}' },
  { name: "core.plugins.list", risk: "read", description: "List registered local/MCP/HTTPS plugin manifests and enabled state.", args: '{}' },
  { name: "core.plugins.register", risk: "approval", description: "Register a plugin manifest; registration never auto-enables it.", args: '{"name":"...","version":"1.0","description":"...","transport":"mcp|http|local","permissions":[]}' },
  { name: "core.plugins.enable", risk: "approval", description: "Enable or disable a registered plugin after owner approval.", args: '{"id":"plugin_...","enabled":true}' },
  { name: "core.selfImprove.propose", risk: "read", description: "Generate a measured self-improvement experiment plan. Auto-merge is always false.", args: '{"problem":"...","metric":"...","baseline":0.5,"target":0.8,"files":[]}' },
  { name: "core.quant.robustness", risk: "read", description: "Calculate Probabilistic Sharpe Ratio and an approximate multiple-testing-deflated Sharpe warning from trade/period returns.", args: '{"returns":[0.01,-0.005,0.008],"benchmarkSharpe":0,"trials":100}' },
  { name: "core.commandCenter.status", risk: "read", description: "Aggregate missions, agent roles, plugins, sandbox, device mesh, research factory and pending approvals.", args: '{}' },
  { name: "core.approvals.list", risk: "read", description: "List unexpired pending owner approvals without executing them.", args: '{}' },
  { name: "core.computer.status", risk: "read", description: "Show computer-agent platform capabilities and OS-action policy.", args: '{}' },
  { name: "core.computer.screenshot", risk: "approval", description: "Capture the primary Windows screen to a local data/screenshots file. Requires explicit approval.", args: '{}' },
  { name: "core.mesh.workers", risk: "read", description: "List online Device Mesh nodes that can act as distributed workers.", args: '{}' },
  { name: "core.mesh.dispatch", risk: "approval", description: "Dispatch a bounded capability-scoped work item to one paired online device.", args: '{"deviceId":"...","jobType":"...","payload":{},"requiredCapability":"..."}' },
  { name: "core.security.status", risk: "read", description: "Read the global ARCHEON security/lockdown state.", args: '{}' },
  { name: "core.security.lockdown", risk: "approval", description: "Enable or disable global lockdown. While enabled, approval-gated actions are denied except this control.", args: '{"enabled":true,"reason":"..."}' },
  { name: "core.claim.add", risk: "approval", description: "Persist a provenance-aware research claim with source classes, confidence and contradiction links.", args: '{"text":"...","sourceRefs":["..."],"sourceTypes":["paper"],"confidence":0.8}' },
  { name: "core.claim.search", risk: "read", description: "Search the local evidence/claim graph with confidence and source-independence signals.", args: '{"query":"...","limit":20}' },
  { name: "core.book.analyze", risk: "read", description: "Extract chapter-like headings and high-frequency concepts from authorized book text.", args: '{"title":"...","text":"..."}' },
  { name: "core.portfolio.analyze", risk: "read", description: "Analyze multi-asset return correlations, weighted portfolio volatility and extremes for research.", args: '{"series":{"XAUUSD":[0.01],"BTCUSD":[0.02]},"weights":{"XAUUSD":0.5,"BTCUSD":0.5}}' },
  { name: "core.microstructure.analyze", risk: "read", description: "Calculate VWAP, range, spread and optional buy/sell volume imbalance from tick-like data.", args: '{"ticks":[{"price":100,"volume":1,"side":"buy","spread":0.1}]}' },
  { name: "core.coding.workflow", risk: "read", description: "Build a gated architect→coder→QA→security→owner coding workflow for an objective.", args: '{"objective":"...","repo":"optional","deploy":false}' },
  { name: "core.vision.plan", risk: "read", description: "Plan a permission-separated vision task for screenshot, phone camera, Meta camera or file input.", args: '{"source":"screenshot","goal":"inspect UI"}' },
  { name: "core.iot.plan", risk: "read", description: "Prepare but do not execute an HTTPS Home Assistant service request with explicit security prerequisites.", args: '{"baseUrl":"https://home.example","domain":"light","service":"turn_on","entityId":"light.office"}' },
  { name: "core.events.window", risk: "read", description: "Classify whether a timestamp falls inside a sourced market-event risk window; never predicts direction.", args: '{"events":[{"time":"2026-09-19T12:00:00Z","name":"CPI","currency":"USD","importance":"high"}],"beforeMinutes":30,"afterMinutes":30}' },
  { name: "core.units.convert", risk: "read", description: "Convert supported engineering units while enforcing dimensional compatibility.", args: '{"value":10,"from":"kN","to":"N"}' },
  { name: "core.units.check", risk: "read", description: "Check whether labelled engineering terms have consistent declared dimensions.", args: '{"terms":[{"label":"A","dimension":"force"},{"label":"B","dimension":"force"}]}' },
  { name: "core.biomed.appraise", risk: "read", description: "Heuristically appraise evidence rows and surface missing bias/directness/precision fields; not a clinical decision tool.", args: '{"studies":[{"design":"RCT","sampleSize":500,"randomized":true,"riskOfBias":"low"}]}' },
  { name: "core.cognition.authority", risk: "read", description: "Read autonomous-cognition authority state and fixed authority boundaries.", args: '{}' },
  { name: "core.cognition.configure", risk: "approval", description: "Enable or disable bounded autonomous cognition and configure internal cycle limits.", args: '{"enabled":true,"level":3,"maxActionsPerCycle":8,"maxResearchJobsPerCycle":2}' },
  { name: "core.cognition.run", risk: "read", description: "Run one bounded cognition cycle across curiosity, reflection, goals and low-risk internal follow-up.", args: '{}' },
  { name: "core.cognition.idle", risk: "read", description: "Run one idle cognition cycle including memory-maintenance scan.", args: '{}' },
  { name: "core.cognition.history", risk: "read", description: "Read recent cognition-cycle summaries.", args: '{"limit":50}' },
  { name: "core.cognition.queue", risk: "read", description: "List prioritized Inner Thought Queue items.", args: '{"limit":100,"status":"queued"}' },
  { name: "core.cognition.enqueue", risk: "approval", description: "Add an explicit item to the Inner Thought Queue.", args: '{"kind":"question","title":"...","reason":"...","importance":0.8}' },
  { name: "core.cognition.resolve", risk: "approval", description: "Resolve, discard or block a thought item with a recorded result.", args: '{"id":"thought_...","status":"resolved","result":"..."}' },
  { name: "core.belief.upsert", risk: "approval", description: "Create or update a calibrated belief with supporting/opposing evidence references.", args: '{"statement":"...","confidence":0.6,"support":["..."],"against":[],"domain":"trading"}' },
  { name: "core.belief.list", risk: "read", description: "List calibrated beliefs and evidence balance.", args: '{"limit":100}' },
  { name: "core.belief.revise", risk: "approval", description: "Revise belief confidence with a bounded delta and evidence reference.", args: '{"id":"belief_...","delta":-0.1,"evidenceRef":"...","direction":"against"}' },
  { name: "reach.doctor", risk: "read", description: "Probe JARVIS internet capability channels and choose the first healthy backend for each channel.", args: "{}" },
  { name: "reach.route", risk: "read", description: "Route a URL to the matching Reach channel and ordered backend candidates.", args: '{"url":"https://..."}' },
  { name: "reach.agentReach.doctor", risk: "read", description: "Run Agent-Reach doctor --json when its CLI is installed.", args: "{}" },
  { name: "reach.web.read", risk: "read", description: "Read a public HTTPS page through the safe Reach layer.", args: '{"url":"https://..."}' },
  { name: "reach.search.exa", risk: "read", description: "Semantic web search through Exa/mcporter when configured.", args: '{"query":"...","limit":5}' },
  { name: "reach.github.search", risk: "read", description: "Search GitHub repositories using the official gh CLI.", args: '{"query":"agent framework","limit":10}' },
  { name: "reach.rss.read", risk: "read", description: "Read bounded RSS/Atom feed titles from HTTPS.", args: '{"url":"https://.../feed.xml","limit":15}' },
  { name: "reach.youtube.transcript", risk: "read", description: "Extract available YouTube subtitles/transcript using yt-dlp without downloading video.", args: '{"url":"https://youtube.com/watch?v=...","lang":"en.*,ar.*"}' },
  { name: "reach.social.search", risk: "read", description: "Read-only search across supported social/community channels using the active local backend (Twitter, Reddit, Facebook, Instagram, XiaoHongShu, Bilibili).", args: '{"platform":"reddit","query":"...","limit":10}' },
  { name: "reach.career.search", risk: "read", description: "Read-only career search via LinkedIn MCP or Boss strict existing-browser CDP mode. Boss requires a user-controlled logged-in dedicated browser session.", args: '{"platform":"linkedin|boss","query":"AI engineer","location":"optional"}' },
  { name: "reach.install", risk: "approval", description: "Install/update Agent-Reach from its MIT-licensed GitHub repository; system dependency installation only when mode=system. Requires explicit approval.", args: '{"mode":"safe|system"}' },
  { name: "system.info", risk: "read", description: "Read operating system, CPU, memory and uptime information.", args: "{}" },
  { name: "workspace.list", risk: "read", description: "List files/folders inside the configured JARVIS workspace only.", args: '{"path":"optional relative path"}' },
  { name: "workspace.read", risk: "read", description: "Read a UTF-8 text file inside the configured workspace. Secret files are blocked by default.", args: '{"path":"relative/file.txt"}' },
  { name: "workspace.search", risk: "read", description: "Search text files inside the configured workspace for a literal query.", args: '{"query":"text","path":"optional relative directory"}' },
  { name: "project.index", risk: "read", description: "Scan the workspace and build a structural code index: stack, scripts, extensions, key files and file map.", args: "{}" },
  { name: "project.retrieve", risk: "read", description: "Retrieve the most relevant project files/snippets for a natural-language coding question.", args: '{"query":"what to find","limit":8}' },
  { name: "project.review", risk: "read", description: "Run a read-only structural/static review of the current project and report notable findings.", args: "{}" },
  { name: "git.status", risk: "read", description: "Run read-only git status in the configured workspace.", args: "{}" },
  { name: "git.diff", risk: "read", description: "Read the current git diff in the configured workspace.", args: "{}" },
  { name: "workspace.patch", risk: "approval", description: "Replace one exact text fragment in one workspace file. Shows a diff and requires explicit approval; verifies file hash before writing and creates a backup.", args: '{"path":"src/file.ts","find":"exact old text","replace":"new text"}' },
  { name: "workspace.createFile", risk: "approval", description: "Create a new text file inside the workspace. Requires approval and refuses to overwrite an existing file.", args: '{"path":"src/new-file.ts","content":"file contents"}' },
  { name: "project.check", risk: "approval", description: "Run one configured project check script: build, lint, typecheck, or test. Requires approval because package scripts execute code.", args: '{"script":"build|lint|typecheck|test"}' },
  { name: "system.openApp", risk: "approval", description: "Open an allow-listed local application (code, notepad, calculator). Requires approval and local OS actions enabled.", args: '{"app":"code|notepad|calculator"}' },
  { name: "github.repo", risk: "read", description: "Read public/configured GitHub repository metadata.", args: '{"repo":"owner/repository"}' },
  { name: "github.file", risk: "read", description: "Read one text file from a GitHub repository through the REST API.", args: '{"repo":"owner/repository","path":"README.md","ref":"optional branch"}' },
  { name: "supabase.select", risk: "read", description: "Read rows from one configured Supabase table. No writes are allowed.", args: '{"table":"products","select":"id,name","limit":20}' },
  { name: "api.catalog.sync", risk: "read", description: "Refresh the local capability catalog from public-apis/public-apis on GitHub.", args: "{}" },
  { name: "api.catalog.search", risk: "read", description: "Search the public API capability catalog by need/category/description.", args: '{"query":"weather Jordan","limit":12}' },
  { name: "internet.fetch", risk: "read", description: "Safely fetch public HTTPS text/JSON/HTML documentation. Blocks private networks, binary payloads and oversized responses.", args: '{"url":"https://example.com/docs"}' },
  { name: "api.skill.list", risk: "read", description: "List reusable API skills JARVIS has learned and persisted.", args: "{}" },
  { name: "api.skill.run", risk: "read", description: "Run a persisted GET-only API skill with named parameters.", args: '{"name":"weather.lookup","params":{"city":"Amman"}}' },
  { name: "api.skill.register", risk: "approval", description: "Persist a new reusable GET-only API skill after documentation has been inspected. Requires explicit approval.", args: '{"name":"weather.lookup","description":"Lookup weather","urlTemplate":"https://api.example.com/weather?city={{city}}"}' },
  { name: "learning.search", risk: "read", description: "Search JARVIS long-term learned evidence with source, reliability and timestamps.", args: '{"query":"project architecture","limit":8}' },
  { name: "learning.stats", risk: "read", description: "Show self-learning store statistics and source distribution.", args: "{}" },
  { name: "knowledge.search", risk: "read", description: "Search the local Knowledge Fabric across indexed books, datasets, papers and curated sources with provenance and trust scores.", args: '{"query":"ICT liquidity sweep","limit":8}' },
  { name: "knowledge.stats", risk: "read", description: "Show Knowledge Fabric source/chunk statistics.", args: "{}" },
  { name: "knowledge.kaggle.search", risk: "read", description: "Search Kaggle datasets using the configured Kaggle Personal Token. Search itself does not persist dataset rows.", args: '{"query":"gold xauusd forex","page":1}' },
  { name: "knowledge.kaggle.ingestFile", risk: "approval", description: "Download one explicitly selected text/CSV/JSON file from a Kaggle dataset with the official Kaggle CLI, enforce size/type limits, and index it with provenance.", args: '{"dataset":"owner/dataset","file":"data.csv","license":"CC-BY-4.0","tags":["finance"]}' },
  { name: "knowledge.hf.search", risk: "read", description: "Search Hugging Face public datasets. Optional HF token supports authenticated/gated access already granted to the user.", args: '{"query":"finance trading","limit":12}' },
  { name: "knowledge.hf.ingestSample", risk: "approval", description: "Persist up to 100 rows plus schema metadata from a Hugging Face Dataset Viewer split into Knowledge Fabric.", args: '{"dataset":"owner/name","config":"optional","split":"optional","length":50,"license":"from dataset card","tags":["finance"]}' },
  { name: "knowledge.worldbank.indicator", risk: "read", description: "Read World Bank Indicator API time-series data.", args: '{"indicator":"NY.GDP.MKTP.CD","country":"JOR","date":"2015:2026"}' },
  { name: "knowledge.fred.series", risk: "read", description: "Read a FRED economic time series using FRED_API_KEY.", args: '{"seriesId":"DGS10","observationStart":"2024-01-01"}' },
  { name: "knowledge.sec.companyFacts", risk: "read", description: "Read SEC EDGAR XBRL company facts by CIK without storing private credentials.", args: '{"cik":"0000320193"}' },
  { name: "knowledge.openalex.search", risk: "read", description: "Search open-access scholarly works in OpenAlex for research/evidence discovery.", args: '{"query":"market microstructure liquidity","limit":12}' },
  { name: "knowledge.book.ingestLocal", risk: "approval", description: "Index a user-authorized local book/file from the workspace into the Knowledge Fabric. Supports text/Markdown/CSV/JSON and PDF when pdftotext is installed.", args: '{"path":"books/trading-book.pdf","title":"optional","license":"user-owned","tags":["ICT","SMC"]}' },
  { name: "knowledge.book.ingestUrl", risk: "approval", description: "Index a public/open-license text book URL into the Knowledge Fabric. Project Gutenberg is recognized; other hosts require an explicit license label.", args: '{"url":"https://www.gutenberg.org/...txt","title":"optional","license":"public-domain","tags":["trading"]}' },
  { name: "knowledge.tradingLibrary.list", risk: "read", description: "List curated historical trading/market books available for optional ingestion from Project Gutenberg.", args: "{}" },
  { name: "knowledge.tradingLibrary.ingest", risk: "approval", description: "Fetch and index one curated Project Gutenberg trading book after owner approval.", args: '{"id":"gutenberg-59518"}' },
  { name: "knowledge.promoteText", risk: "approval", description: "Persist a bounded text corpus into Knowledge Fabric with provenance, license and trust metadata.", args: '{"title":"source title","sourceRef":"https://...","sourceKind":"paper|dataset|web|api|local|book","content":"text","license":"...","trust":0.8,"tags":["..."]}' },
  { name: "research.hypothesis.create", risk: "approval", description: "Create a falsifiable trading hypothesis with provenance and a programmable strategy specification.", args: '{"title":"...","claim":"...","sourceRefs":["..."],"strategy":{"kind":"sma-cross|rsi-reversion|donchian-breakout|bollinger-reversion|ema-trend-pullback|atr-breakout|range-fade|ict-smc","params":{}}}' },
  { name: "research.hypothesis.list", risk: "read", description: "List Research Lab hypotheses and optional lifecycle status.", args: '{"limit":50,"status":"optional"}' },
  { name: "research.candidates.generate", risk: "approval", description: "Generate a bounded population of falsifiable strategy candidates for testing; does not promote or trade them.", args: '{"seed":"liquidity/trend/mean-reversion idea","count":12,"timeframe":"M15","sourceRefs":["paper/book refs"]}' },
  { name: "research.knowledge.mine", risk: "approval", description: "Mine provenance-aware Knowledge Fabric evidence for programmable strategy families and create falsifiable hypotheses linked to the sourceRefs.", args: '{"query":"liquidity sweep volatility breakout","limit":12,"maxHypotheses":8,"timeframe":"M15"}' },
  { name: "research.candidates.mutate", risk: "approval", description: "Generate parameter-neighborhood child hypotheses from one parent for evolutionary robustness research.", args: '{"hypothesisId":"hyp_...","count":8,"seed":"optional"}' },
  { name: "research.backtest.csv", risk: "approval", description: "Run chronological train/test, walk-forward, bootstrap, cost-stress and parameter-stability validation on OHLC CSV data.", args: '{"hypothesisId":"hyp_...","csvPath":"data/XAUUSD.csv","symbol":"XAUUSD","timeframe":"M15","spreadBps":2,"commissionBps":1,"slippageBps":1}' },
  { name: "research.rank", risk: "read", description: "Rank experimentally tested candidates by robustness metrics; ranking is research-only and not an order instruction.", args: '{"limit":20}' },
  { name: "research.orchestrator.run", risk: "approval", description: "Run a bounded cross-symbol/cross-timeframe/cross-dataset experiment matrix (up to 500 backtests) over selected hypotheses. Never sends orders.", args: '{"hypothesisIds":["hyp_..."],"datasets":[{"csvPath":"data/XAUUSD_M15.csv","symbol":"XAUUSD","timeframe":"M15"}],"costs":[{"name":"base","spreadBps":2,"commissionBps":1,"slippageBps":1}],"maxRuns":300,"seed":"research-2026-09"}' },
  { name: "research.orchestrator.history", risk: "read", description: "Read prior bounded Research Orchestrator matrix runs.", args: '{"limit":20}' },
  { name: "research.portfolio.championChallenger", risk: "read", description: "Build a research-only Champion/Challenger portfolio from cross-dataset experiments using coverage, pass-rate, robustness, PF and worst drawdown. Does not promote to live trading.", args: '{"minCoverage":2,"minPassRate":0.6,"challengers":5}' },
  { name: "research.swarm.run", risk: "read", description: "Run multi-source read-only research in parallel through Reach channels and PubMed, keeping source-class reliability priors explicit.", args: '{"query":"topic","include":["web","github","reddit","pubmed"],"limit":5}' },
  { name: "research.factory.seed", risk: "approval", description: "Seed the Autonomous Research Factory with regime scans, a bounded matrix, evolutionary generations and a final portfolio job. No live orders.", args: '{"datasets":[{"csvPath":"data/XAUUSD_M15.csv","symbol":"XAUUSD","timeframe":"M15"}],"generations":3,"matrixRuns":500,"seed":"factory-v13"}' },
  { name: "research.factory.enqueue", risk: "approval", description: "Enqueue one resumable Research Factory job (matrix, evolution, regime-scan, portfolio).", args: '{"kind":"evolution","payload":{"offspring":12},"maxAttempts":2}' },
  { name: "research.factory.run", risk: "approval", description: "Process queued Research Factory jobs with bounded retries and persisted state. Research only.", args: '{"maxJobs":20}' },
  { name: "research.factory.status", risk: "read", description: "Show persistent Research Factory queue/status and recent results.", args: '{}' },
  { name: "research.factory.cancel", risk: "approval", description: "Cancel a queued/running Research Factory job by id.", args: '{"id":"job_..."}' },
  { name: "research.genome.crossover", risk: "approval", description: "Create a reproducible child Strategy Genome from two hypotheses; cross-family parents become a hybrid-vote strategy. Research only.", args: '{"parentA":"hyp_...","parentB":"hyp_...","seed":"cross-1"}' },
  { name: "research.genome.evolve", risk: "approval", description: "Evolve a bounded population from elite hypotheses using seeded crossover and mutation.", args: '{"seed":"generation-1","elite":8,"offspring":12}' },
  { name: "research.regimes.analyze", risk: "read", description: "Segment a local OHLC CSV into trend/range/volatility regimes for regime-aware research.", args: '{"csvPath":"data/XAUUSD_M15.csv","window":100}' },
  { name: "research.agenticStack.status", risk: "read", description: "Show JARVIS agentic-stack registry derived from reviewed 2026 projects (harness, gateways, web grounding, browser, sandbox, long-horizon agents, tracing).", args: '{}' },
  { name: "research.traces.recent", risk: "read", description: "Read recent local agent/tool trace events for observability and debugging.", args: '{"limit":100}' },
  { name: "research.datasets.mt5Snapshot", risk: "approval", description: "Capture up to 5000 historical bars from the connected MT5 terminal into a local research CSV. Does not trade.", args: '{"symbol":"XAUUSD","timeframe":"M15","count":5000}' },
  { name: "research.datasets.list", risk: "read", description: "List local CSV snapshots available to the Research Factory.", args: '{}' },
  { name: "research.lifecycle.promote", risk: "approval", description: "Move a hypothesis through validated→paper→shadow→promoted gates only when required evidence thresholds are satisfied.", args: '{"hypothesisId":"hyp_...","to":"paper|shadow|promoted|retired","paperTrades":30,"paperProfitFactor":1.1,"shadowDays":14,"shadowMaxDrawdownPct":8,"reason":"..."}' },
  { name: "research.lifecycle.history", risk: "read", description: "Read immutable research lifecycle transition history.", args: '{"hypothesisId":"optional","limit":100}' },
  { name: "research.stats", risk: "read", description: "Show Research Lab hypothesis, experiment and promotion statistics.", args: '{}' },
  { name: "trading.mt5.status", risk: "read", description: "Read MetaTrader 5 terminal/account connection status through the official Python integration.", args: '{}' },
  { name: "trading.mt5.positions", risk: "read", description: "Read currently open MT5 positions.", args: '{}' },
  { name: "trading.mt5.bars", risk: "read", description: "Read OHLC bars from MT5 for research or signal generation.", args: '{"symbol":"XAUUSD","timeframe":"M15","count":1000}' },
  { name: "trading.ictsmc.detect", risk: "read", description: "Run programmable ICT/SMC detectors over recent MT5 bars: swings, BOS, CHoCH, FVG, order blocks, liquidity sweeps, equal highs/lows and displacement. Detection is descriptive/research-only and does not place orders.", args: '{"symbol":"XAUUSD","timeframe":"M15","count":500,"swingWindow":3,"confirmBars":4,"minScore":1.4}' },
  { name: "trading.autopilot.status", risk: "read", description: "Read the current trading permit and expiry.", args: '{}' },
  { name: "trading.autopilot.arm", risk: "approval", description: "Arm paper or live autonomous trading for a bounded number of minutes. Required before any order can be sent.", args: '{"mode":"paper|live","minutes":60}' },
  { name: "trading.autopilot.disarm", risk: "approval", description: "Immediately revoke the active trading permit / kill switch.", args: '{}' },
  { name: "trading.autopilot.step", risk: "approval", description: "Evaluate one paper/shadow/promoted hypothesis on the latest CLOSED MT5 bar and only when lifecycle + permit + risk gates allow submit one paper/live order.", args: '{"hypothesisId":"hyp_...","mode":"paper|shadow|live","symbol":"XAUUSD","timeframe":"M15","volume":0.01}' },
  { name: "trading.mt5.order", risk: "approval", description: "Submit a paper/live MT5 order only while a matching time-limited permit is armed and symbol/volume/risk limits pass.", args: '{"mode":"paper|live","symbol":"XAUUSD","side":"buy|sell","volume":0.01,"sl":0,"tp":0,"comment":"JARVIS"}' },
  { name: "telegram.send", risk: "approval", description: "Send an operational alert to an allow-listed Telegram chat.", args: '{"text":"...","chatId":"optional"}' },
  { name: "domain.pubmed.search", risk: "read", description: "Search PubMed via NCBI E-utilities for biomedical evidence discovery.", args: '{"query":"...","limit":10}' },
  { name: "domain.biomed.evidenceBrief", risk: "read", description: "Build a research-only PubMed evidence map with study-type hints and explicit clinical limitations; never autonomously diagnoses or prescribes.", args: '{"query":"...","limit":12}' },
  { name: "domain.biomed.pico", risk: "read", description: "Build a PICO-formulated PubMed evidence table scaffold (Population, Intervention, Comparison, Outcome) with explicit appraisal gaps; no diagnosis or prescribing.", args: '{"population":"adults with...","intervention":"...","comparison":"...","outcome":"...","limit":15}' },
  { name: "domain.engineering.adapters.doctor", risk: "read", description: "Probe optional local scientific-engineering adapters: ngspice, CalculiX, Gmsh, OpenFOAM and python-control.", args: '{}' },
  { name: "domain.spice.run", risk: "approval", description: "Run a workspace-contained SPICE netlist using ngspice batch mode. Requires explicit approval because it executes a local solver and writes output.", args: '{"netlistPath":"sim/circuit.cir","outputPath":"sim/circuit.log"}' },
  { name: "domain.fea.run", risk: "approval", description: "Run a workspace-contained CalculiX .inp finite-element job. Requires explicit approval and writes solver outputs.", args: '{"inputPath":"fea/model.inp"}' },
  { name: "domain.cfd.run", risk: "approval", description: "Run an allowlisted OpenFOAM solver against a workspace case directory. Requires explicit approval; solver is bounded by timeout/allowlist.", args: '{"casePath":"cfd/case1","solver":"simpleFoam"}' },
  { name: "domain.mesh.run", risk: "approval", description: "Generate a 2D/3D mesh with Gmsh from a workspace-contained geometry file. Requires explicit approval and writes a mesh file.", args: '{"geometryPath":"fea/model.geo","dimension":3,"outputPath":"fea/model.msh"}' },
  { name: "domain.control.simulate", risk: "read", description: "Simulate a continuous state-space control model x_dot=Ax+Bu, y=Cx+Du using bounded forward-Euler integration.", args: '{"A":[[0,1],[-2,-3]],"B":[[0],[1]],"C":[[1,0]],"D":[[0]],"u":[1],"dt":0.01,"steps":1000}' },
  { name: "domain.engineering.calculate", risk: "read", description: "Run deterministic engineering calculations with explicit equations and assumptions across electrical, mechanical, fluids, thermal and structural primitives.", args: '{"kind":"ohms-law|dc-power|beam-simply-supported-center-load|shaft-torsion|reynolds-number|heat-conduction-plane-wall|kinetic-energy","inputs":"see tool description"}' },
  { name: "llm.resources.sync", risk: "read", description: "Refresh the free/trial LLM provider catalog from raullenchai/free-llm-api-resources.", args: "{}" },
  { name: "llm.resources.search", risk: "read", description: "Search free/trial LLM providers and models by provider/model/capability.", args: '{"query":"qwen coder","limit":12}' },
  { name: "llm.models", risk: "read", description: "List configured model routes without exposing API keys.", args: "{}" },
  { name: "llm.route", risk: "read", description: "Show how JARVIS would route a task across configured models.", args: '{"query":"review a large Next.js repository","limit":8}' },
  { name: "device.mesh.status", risk: "read", description: "Show Device Mesh and encrypted Health Vault status.", args: "{}" },
  { name: "device.list", risk: "read", description: "List paired devices and their advertised capabilities without exposing device tokens.", args: "{}" },
  { name: "device.commands", risk: "read", description: "Inspect recent Device Mesh command state.", args: '{"deviceId":"optional","limit":20}' },
  { name: "device.pair.start", risk: "approval", description: "Create a short-lived pairing code for an Android companion or other mesh device.", args: '{"label":"optional phone name"}' },
  { name: "device.revoke", risk: "approval", description: "Revoke a paired device token and all Permission Broker grants.", args: '{"deviceId":"uuid"}' },
  { name: "device.permission.catalog", risk: "read", description: "List Device Mesh capabilities and sensitivity levels.", args: "{}" },
  { name: "device.permission.list", risk: "read", description: "List capability grants and permission requests for a device.", args: '{"deviceId":"optional uuid"}' },
  { name: "device.permission.request", risk: "read", description: "Record a device capability request for later owner approval. Does not grant access.", args: '{"deviceId":"uuid","capabilities":["health.heart_rate.read"],"reason":"optional"}' },
  { name: "device.permission.grant", risk: "approval", description: "Grant one or more scoped capabilities to a paired device.", args: '{"deviceId":"uuid","capabilities":["health.heart_rate.read"],"ttlMinutes":60,"reason":"optional"}' },
  { name: "device.permission.revoke", risk: "approval", description: "Revoke some or all capability grants from a paired device.", args: '{"deviceId":"uuid","capabilities":["optional"]}' },
  { name: "device.notify", risk: "approval", description: "Queue a notification to a paired Android companion.", args: '{"deviceId":"uuid","title":"JARVIS","body":"text"}' },
  { name: "device.vibrate", risk: "approval", description: "Queue a short vibration command to a paired phone/wearable.", args: '{"deviceId":"uuid","ms":300}' },
  { name: "health.latest", risk: "read", description: "Read latest samples from the encrypted Health Vault. Result is isolated from Council/model learning.", args: '{"deviceId":"optional","types":["heart_rate","blood_pressure"],"limit":20}' },
  { name: "browser.skill.status", risk: "read", description: "Check Tencent BrowserSkill/bsk daemon + extension readiness without auto-starting it.", args: "{}" },
  { name: "browser.skill.start", risk: "approval", description: "Start a BrowserSkill agent session. BrowserSkill's own confirmation rules remain active.", args: "{}" },
  { name: "browser.skill.stop", risk: "approval", description: "Stop a BrowserSkill session and return borrowed tabs.", args: '{"sessionId":"id"}' },
  { name: "browser.skill.navigate", risk: "approval", description: "Navigate a BrowserSkill-controlled tab to an http/https URL.", args: '{"sessionId":"id","url":"https://example.com"}' },
  { name: "browser.skill.observe", risk: "read", description: "Observe the semantic page state of an existing BrowserSkill-controlled session.", args: '{"sessionId":"id","maxTokens":4000}' },
  { name: "browser.skill.click", risk: "approval", description: "Click a fresh BrowserSkill element ref in a controlled session.", args: '{"sessionId":"id","ref":"@e3"}' },
  { name: "browser.skill.fill", risk: "approval", description: "Fill a fresh BrowserSkill element ref in a controlled session.", args: '{"sessionId":"id","ref":"@e3","value":"text"}' },
  { name: "browser.skill.tabs", risk: "read", description: "List user tabs visible to BrowserSkill before an explicit borrow. Requires browser.observe broker grant.", args: '{"sessionId":"id"}' },
  { name: "browser.skill.borrow", risk: "approval", description: "Request borrowing an existing user tab. BrowserSkill extension confirmation remains authoritative.", args: '{"sessionId":"id","tabId":"id"}' },
  { name: "browser.skill.return", risk: "approval", description: "Return a borrowed user tab to the user browser window.", args: '{"sessionId":"id","tabId":"id"}' },
  { name: "meta.photo.capture", risk: "approval", description: "Queue a Meta Wearables photo capture through the paired Android companion and DAT SDK.", args: '{"deviceId":"android companion uuid"}' },
  { name: "meta.camera.stream", risk: "approval", description: "Start/stop Meta Wearables camera streaming through the Android companion.", args: '{"deviceId":"android companion uuid","action":"start|stop","quality":"low|medium|high"}' },
  { name: "meta.display.render", risk: "approval", description: "Render text on supported Meta display glasses through the Android companion.", args: '{"deviceId":"android companion uuid","text":"message"}' },
];

const ignoredDirs = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo"]);
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
  /device[-_]?mesh.*key/i,
  /health[-_]?vault/i,
  /^\.device-mesh\.key$/i,
];

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function safeResolve(relative = ".") {
  const root = path.resolve(jarvisConfig.workspacePath);
  const target = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error("Path is outside the configured JARVIS workspace.");
  }
  return target;
}

function relativeToWorkspace(target: string) {
  return path.relative(jarvisConfig.workspacePath, target).replace(/\\/g, "/") || ".";
}

function truncate(text: string, max = 80_000) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n...[truncated ${text.length - max} characters]`;
}

function isSensitivePath(target: string) {
  if (jarvisConfig.allowSecretFiles) return false;
  const name = path.basename(target);
  if (name === ".env.example" || name.endsWith(".example")) return false;
  return sensitiveNames.some((pattern) => pattern.test(name));
}

function assertReadablePath(target: string) {
  if (isSensitivePath(target)) throw new Error("This file is treated as sensitive and is blocked. Keep JARVIS_ALLOW_SECRET_FILES=false unless you explicitly accept the risk.");
}

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function readWorkspaceText(relative: string, maxBytes = jarvisConfig.maxReadBytes) {
  if (!relative) throw new Error("path is required.");
  const target = safeResolve(relative);
  assertReadablePath(target);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error("Expected a file.");
  if (stat.size > maxBytes) throw new Error(`File is too large (${stat.size} bytes). Max is ${maxBytes}.`);
  const raw = await fs.readFile(target);
  if (raw.includes(0)) throw new Error("Binary files are not supported.");
  return { target, stat, text: raw.toString("utf8") };
}

async function systemInfo(): Promise<ToolExecutionResult> {
  const freeMb = Math.round(os.freemem() / 1024 / 1024);
  const totalMb = Math.round(os.totalmem() / 1024 / 1024);
  const data = {
    platform: os.platform(), release: os.release(), arch: os.arch(), hostname: os.hostname(), cpus: os.cpus().length,
    freeMemoryMb: freeMb, totalMemoryMb: totalMb, uptimeMinutes: Math.round(os.uptime() / 60), workspace: jarvisConfig.workspacePath,
  };
  return { ok: true, tool: "system.info", summary: JSON.stringify(data, null, 2), data };
}

async function workspaceList(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const target = safeResolve(asString(args.path, "."));
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) throw new Error("workspace.list expects a directory.");
  const entries = (await fs.readdir(target, { withFileTypes: true }))
    .filter((entry) => !ignoredDirs.has(entry.name))
    .filter((entry) => !isSensitivePath(path.join(target, entry.name)))
    .slice(0, 250)
    .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other" }));
  return {
    ok: true,
    tool: "workspace.list",
    summary: `${relativeToWorkspace(target)}\n${entries.map((e) => `${e.type === "dir" ? "[D]" : "[F]"} ${e.name}`).join("\n") || "(empty)"}`,
    data: entries,
  };
}

async function workspaceRead(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const relative = asString(args.path);
  const { target, stat, text } = await readWorkspaceText(relative);
  return { ok: true, tool: "workspace.read", summary: truncate(text, jarvisConfig.maxReadBytes), data: { path: relativeToWorkspace(target), bytes: stat.size, sha256: sha256(text) } };
}

async function collectFiles(dir: string, out: string[]) {
  if (out.length >= jarvisConfig.maxSearchFiles) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= jarvisConfig.maxSearchFiles) return;
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (isSensitivePath(full)) continue;
    if (entry.isDirectory()) {
      await collectFiles(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (textExtensions.has(ext) || entry.name.endsWith(".example")) out.push(full);
    }
  }
}

async function workspaceSearch(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = asString(args.query).trim();
  if (!query) throw new Error("query is required.");
  const start = safeResolve(asString(args.path, "."));
  const stat = await fs.stat(start);
  if (!stat.isDirectory()) throw new Error("workspace.search path must be a directory.");
  const files: string[] = [];
  await collectFiles(start, files);
  const matches: Array<{ path: string; line: number; text: string }> = [];
  const needle = query.toLowerCase();

  for (const file of files) {
    if (matches.length >= 100) break;
    try {
      const fileStat = await fs.stat(file);
      if (fileStat.size > jarvisConfig.maxReadBytes) continue;
      const content = await fs.readFile(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < 100; i += 1) {
        if (lines[i].toLowerCase().includes(needle)) {
          matches.push({ path: relativeToWorkspace(file), line: i + 1, text: lines[i].trim().slice(0, 500) });
        }
      }
    } catch {
      // Skip unreadable files.
    }
  }

  return {
    ok: true, tool: "workspace.search",
    summary: matches.length ? matches.map((m) => `${m.path}:${m.line}  ${m.text}`).join("\n") : `No matches found for “${query}”.`,
    data: { searchedFiles: files.length, matches },
  };
}

async function projectIndex(): Promise<ToolExecutionResult> {
  const index = await buildProjectIndex();
  const topExtensions = Object.entries(index.extensions).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const summary = [
    `Workspace: ${index.workspace}`,
    `Files indexed: ${index.fileCount}`,
    `Stack: ${index.stack.join(", ") || "Unknown"}`,
    `Key files: ${index.keyFiles.join(", ") || "—"}`,
    `Scripts: ${Object.keys(index.scripts).join(", ") || "—"}`,
    `Extensions: ${topExtensions.map(([ext, count]) => `${ext}=${count}`).join(", ")}`,
    "",
    "File map:",
    ...index.files.slice(0, 180).map((file) => `- ${file.path} (${file.size} B)`),
    ...(index.files.length > 180 ? [`... ${index.files.length - 180} more files`] : []),
  ].join("\n");
  return { ok: true, tool: "project.index", summary: truncate(summary), data: index };
}

async function projectRetrieve(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = asString(args.query).trim();
  if (!query) throw new Error("query is required.");
  const limit = asInt(args.limit, 8, 1, 12);
  const result = await retrieveProjectContext(query, limit);
  const summary = result.results.length
    ? result.results.map((item) => `## ${item.path} [score ${item.score}]\n${item.snippets.join("\n")}`).join("\n\n")
    : `No relevant project context found for “${query}”.`;
  return { ok: true, tool: "project.retrieve", summary: truncate(summary), data: result };
}

async function projectReviewTool(): Promise<ToolExecutionResult> {
  const review = await reviewProject();
  const summary = [
    `Project review: ${review.index.fileCount} files | stack: ${review.index.stack.join(", ") || "Unknown"}`,
    `Findings: high=${review.counts.high}, warning=${review.counts.warning}, info=${review.counts.info}`,
    "",
    ...review.findings.map((item) => `${item.severity.toUpperCase()} ${item.path}${item.line ? `:${item.line}` : ""} — ${item.issue}`),
    ...(review.findings.length === 0 ? ["No static findings from the current review rules."] : []),
  ].join("\n");
  return { ok: true, tool: "project.review", summary: truncate(summary), data: review };
}

async function runGit(args: string[], tool: string): Promise<ToolExecutionResult> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: jarvisConfig.workspacePath, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
  });
  const output = truncate([stdout, stderr].filter(Boolean).join("\n").trim() || "No output.");
  return { ok: true, tool, summary: output };
}

function occurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    count += 1;
    from = index + Math.max(needle.length, 1);
  }
  return count;
}

function patchDiff(relative: string, before: string, find: string, replace: string) {
  const index = before.indexOf(find);
  const startLine = before.slice(0, Math.max(index, 0)).split(/\r?\n/).length;
  const oldLines = find.split(/\r?\n/);
  const newLines = replace.split(/\r?\n/);
  return truncate([
    `--- a/${relative}`,
    `+++ b/${relative}`,
    `@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n"), 24_000);
}

async function preparePatch(call: ToolCall) {
  const relative = asString(call.args.path);
  const find = asString(call.args.find);
  const replace = asString(call.args.replace);
  if (!relative || !find) throw new Error("workspace.patch requires path and a non-empty exact find string.");
  if (Buffer.byteLength(replace, "utf8") > jarvisConfig.maxWriteBytes) throw new Error("Replacement exceeds JARVIS_MAX_WRITE_BYTES.");
  const { text } = await readWorkspaceText(relative, jarvisConfig.maxWriteBytes);
  const count = occurrences(text, find);
  if (count !== 1) throw new Error(`Exact find text must occur exactly once; found ${count} occurrences.`);
  const preview = patchDiff(relativeToWorkspace(safeResolve(relative)), text, find, replace);
  return {
    call: { ...call, args: { ...call.args, expectedSha256: sha256(text) } },
    preview,
  };
}

async function executePatch(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const relative = asString(args.path);
  const find = asString(args.find);
  const replace = asString(args.replace);
  const expectedSha = asString(args.expectedSha256);
  if (!relative || !find || !expectedSha) throw new Error("Approved patch is missing validated fields.");
  const { target, text } = await readWorkspaceText(relative, jarvisConfig.maxWriteBytes);
  const currentSha = sha256(text);
  if (currentSha !== expectedSha) throw new Error("File changed after approval preview. Patch cancelled; request a new review.");
  const count = occurrences(text, find);
  if (count !== 1) throw new Error(`Patch target changed; expected one exact match, found ${count}.`);
  const after = text.replace(find, replace);
  if (Buffer.byteLength(after, "utf8") > jarvisConfig.maxWriteBytes) throw new Error("Patched file exceeds JARVIS_MAX_WRITE_BYTES.");

  const backupDir = path.resolve(process.cwd(), jarvisConfig.backupPath);
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = relativeToWorkspace(target).replace(/[^A-Za-z0-9_.-]+/g, "__");
  const backupFile = path.join(backupDir, `${stamp}__${safeName}.bak`);
  await fs.writeFile(backupFile, text, "utf8");
  await fs.writeFile(target, after, "utf8");
  return {
    ok: true,
    tool: "workspace.patch",
    summary: `Patched ${relativeToWorkspace(target)} successfully. Backup: ${backupFile}`,
    data: { path: relativeToWorkspace(target), backup: backupFile, beforeSha256: currentSha, afterSha256: sha256(after) },
  };
}

async function prepareCreateFile(call: ToolCall) {
  const relative = asString(call.args.path);
  const content = asString(call.args.content);
  if (!relative) throw new Error("workspace.createFile requires path.");
  const target = safeResolve(relative);
  assertReadablePath(target);
  if (Buffer.byteLength(content, "utf8") > jarvisConfig.maxWriteBytes) throw new Error("File content exceeds JARVIS_MAX_WRITE_BYTES.");
  try {
    await fs.stat(target);
    throw new Error("File already exists. workspace.createFile never overwrites files; use workspace.patch for an existing text file.");
  } catch (error) {
    if (error instanceof Error && !error.message.includes("ENOENT") && !error.message.includes("no such file")) throw error;
  }
  const preview = truncate(`CREATE ${relativeToWorkspace(target)}\n\n${content}`, 24_000);
  return { call, preview };
}

async function executeCreateFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const relative = asString(args.path);
  const content = asString(args.content);
  if (!relative) throw new Error("path is required.");
  const target = safeResolve(relative);
  assertReadablePath(target);
  if (Buffer.byteLength(content, "utf8") > jarvisConfig.maxWriteBytes) throw new Error("File content exceeds JARVIS_MAX_WRITE_BYTES.");
  try {
    await fs.stat(target);
    throw new Error("File already exists; refusing to overwrite.");
  } catch (error) {
    if (error instanceof Error && !error.message.includes("ENOENT") && !error.message.includes("no such file")) throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, { encoding: "utf8", flag: "wx" });
  return { ok: true, tool: "workspace.createFile", summary: `Created ${relativeToWorkspace(target)} (${Buffer.byteLength(content, "utf8")} bytes).` };
}

async function projectCheck(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const script = asString(args.script);
  const allowed = new Set(["build", "lint", "typecheck", "test"]);
  if (!allowed.has(script)) throw new Error("Allowed scripts: build, lint, typecheck, test.");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const { stdout, stderr } = await execFileAsync(npm, ["run", script], {
    cwd: jarvisConfig.workspacePath, timeout: 180_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  });
  const output = truncate([stdout, stderr].filter(Boolean).join("\n").trim() || `${script} completed.`);
  return { ok: true, tool: "project.check", summary: output, data: { script } };
}

async function openApplication(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  if (!jarvisConfig.enableOsActions) throw new Error("OS actions are disabled. Set JARVIS_ENABLE_OS_ACTIONS=true to enable approved app launches.");
  const app = asString(args.app);
  if (!new Set(["code", "notepad", "calculator"]).has(app)) throw new Error("Allowed apps: code, notepad, calculator.");
  let command = "";
  let commandArgs: string[] = [];
  if (app === "code") { command = "code"; commandArgs = [jarvisConfig.workspacePath]; }
  else if (process.platform === "win32") command = app === "notepad" ? "notepad.exe" : "calc.exe";
  else if (process.platform === "darwin") { command = "open"; commandArgs = ["-a", app === "notepad" ? "TextEdit" : "Calculator"]; }
  else command = app === "notepad" ? "gedit" : "gnome-calculator";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, commandArgs, { detached: true, stdio: "ignore", shell: false });
    child.once("spawn", () => { child.unref(); resolve(); });
    child.once("error", reject);
  });
  return { ok: true, tool: "system.openApp", summary: `Launched ${app}.`, data: { app } };
}

function validateRepo(repo: string) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("repo must be owner/repository.");
  return repo;
}

async function githubRequest(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Huthayfa-JARVIS-v0.6",
      ...(jarvisConfig.githubToken ? { Authorization: `Bearer ${jarvisConfig.githubToken}` } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}: ${truncate(await res.text(), 1000)}`);
  return res;
}

async function githubRepo(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const repo = validateRepo(asString(args.repo));
  const res = await githubRequest(`https://api.github.com/repos/${repo}`);
  const data = (await res.json()) as Record<string, unknown>;
  const summary = [
    `${data.full_name || repo}`, `Description: ${data.description || "—"}`, `Default branch: ${data.default_branch || "—"}`,
    `Language: ${data.language || "—"}`, `Stars: ${data.stargazers_count ?? "—"}`, `Open issues: ${data.open_issues_count ?? "—"}`, `Updated: ${data.updated_at || "—"}`,
  ].join("\n");
  return { ok: true, tool: "github.repo", summary, data };
}

async function githubFile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const repo = validateRepo(asString(args.repo));
  const filePath = asString(args.path).replace(/^\/+/, "");
  if (!filePath) throw new Error("path is required.");
  if (filePath.includes("..")) throw new Error("Invalid GitHub file path.");
  const ref = asString(args.ref);
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://api.github.com/repos/${repo}/contents/${encodedPath}`);
  if (ref) url.searchParams.set("ref", ref);
  const res = await githubRequest(url.toString());
  const data = (await res.json()) as { type?: string; encoding?: string; content?: string; size?: number };
  if (data.type !== "file" || data.encoding !== "base64" || !data.content) throw new Error("GitHub path is not a readable file.");
  if ((data.size || 0) > jarvisConfig.maxReadBytes) throw new Error("GitHub file exceeds JARVIS_MAX_READ_BYTES.");
  const text = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { ok: true, tool: "github.file", summary: truncate(text, jarvisConfig.maxReadBytes), data: { repo, path: filePath, ref: ref || null } };
}

async function supabaseSelect(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  if (!jarvisConfig.supabaseUrl || !jarvisConfig.supabaseKey) throw new Error("Supabase connector is not configured. Set JARVIS_SUPABASE_URL and JARVIS_SUPABASE_KEY.");
  const table = asString(args.table);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error("Invalid table name.");
  const select = asString(args.select, "*");
  if (!/^[A-Za-z0-9_.*(),:!\-\s]+$/.test(select)) throw new Error("Invalid select expression.");
  const limit = asInt(args.limit, 20, 1, 100);
  const base = jarvisConfig.supabaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set("select", select);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url, {
    headers: { apikey: jarvisConfig.supabaseKey, Authorization: `Bearer ${jarvisConfig.supabaseKey}`, Accept: "application/json" }, cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${truncate(await res.text(), 1200)}`);
  const data = (await res.json()) as unknown;
  return { ok: true, tool: "supabase.select", summary: truncate(JSON.stringify(data, null, 2)), data };
}


async function internetFetch(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const url = asString(args.url).trim();
  if (!url) throw new Error("url is required.");
  const fetched = await safeFetchText(url, { maxBytes: 600_000 });
  return { ok: true, tool: "internet.fetch", summary: truncate(`URL: ${fetched.url}\nContent-Type: ${fetched.contentType}\n\n${fetched.text}`, 80_000), data: { url: fetched.url, contentType: fetched.contentType } };
}

async function apiCatalogSyncTool(): Promise<ToolExecutionResult> {
  const catalog = await syncPublicApiCatalog();
  const categories = [...new Set(catalog.entries.map((entry) => entry.category))];
  return { ok: true, tool: "api.catalog.sync", summary: `Synced ${catalog.entries.length} APIs across ${categories.length} categories from public-apis/public-apis at ${catalog.syncedAt}.`, data: { count: catalog.entries.length, categories: categories.length, syncedAt: catalog.syncedAt } };
}

async function apiCatalogSearchTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = asString(args.query).trim();
  if (!query) throw new Error("query is required.");
  const limit = asInt(args.limit, 12, 1, 25);
  const result = await searchPublicApis(query, limit);
  const summary = result.results.length
    ? [`Catalog: ${result.total} APIs | synced ${result.syncedAt}`, ...result.results.map((item) => `${item.name} [${item.category}] score=${item.score} auth=${item.auth} https=${item.https} cors=${item.cors}\n${item.description}\n${item.url}`)].join("\n\n")
    : `No public API matches for “${query}”. Catalog size: ${result.total}.`;
  return { ok: true, tool: "api.catalog.search", summary: truncate(summary), data: result };
}

async function apiSkillListTool(): Promise<ToolExecutionResult> {
  const skills = await listApiSkills();
  return { ok: true, tool: "api.skill.list", summary: skills.length ? skills.map((s) => `${s.name} — ${s.description}\n${s.urlTemplate}`).join("\n\n") : "No reusable API skills have been registered yet.", data: skills };
}

async function apiSkillRunTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const name = asString(args.name).trim();
  const params = args.params && typeof args.params === "object" && !Array.isArray(args.params) ? args.params as Record<string, unknown> : {};
  if (!name) throw new Error("name is required.");
  const result = await runApiSkill(name, params);
  return { ok: true, tool: "api.skill.run", summary: truncate(`${result.skill.name}: ${result.skill.description}\nURL: ${result.url}\n\n${result.text}`), data: { name: result.skill.name, url: result.url, contentType: result.contentType } };
}

async function prepareApiSkill(call: ToolCall): Promise<{ call: ToolCall; preview?: string }> {
  const validated = await validateApiSkill(call.args);
  const prepared: ToolCall = { ...call, args: validated };
  const preview = [`NEW API SKILL: ${validated.name}`, validated.description, `GET ${validated.urlTemplate}`, "", "This persists a reusable external capability. No secrets may be embedded and runtime requests remain HTTPS/SSRF protected."].join("\n");
  return { call: prepared, preview };
}

async function executeApiSkillRegister(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const skill = await registerApiSkill(args);
  return { ok: true, tool: "api.skill.register", summary: `Registered reusable API skill: ${skill.name} — ${skill.description}`, data: skill };
}

async function learningSearchTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = asString(args.query).trim();
  if (!query) throw new Error("query is required.");
  const limit = asInt(args.limit, 8, 1, 20);
  const results = await searchLearned(query, limit);
  const summary = results.length ? results.map((item) => `[${item.source} | reliability ${item.reliability.toFixed(2)} | seen ${item.seenCount} | ${item.lastSeenAt}]${item.sourceRef ? ` ${item.sourceRef}` : ""}\n${item.content}`).join("\n\n") : `No learned evidence matched “${query}”.`;
  return { ok: true, tool: "learning.search", summary: truncate(summary), data: results };
}

async function learningStatsTool(): Promise<ToolExecutionResult> {
  const stats = await learningStats();
  return { ok: true, tool: "learning.stats", summary: JSON.stringify(stats, null, 2), data: stats };
}

async function llmResourcesSyncTool(): Promise<ToolExecutionResult> {
  const catalog = await syncFreeLlmCatalog();
  const free = catalog.providers.filter((p) => p.access === "free").length;
  const trial = catalog.providers.filter((p) => p.access === "trial").length;
  return { ok: true, tool: "llm.resources.sync", summary: `Synced ${catalog.providers.length} LLM providers from free-llm-api-resources: free=${free}, trial=${trial}, at ${catalog.syncedAt}.`, data: { providers: catalog.providers.length, free, trial, syncedAt: catalog.syncedAt } };
}

async function llmResourcesSearchTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = asString(args.query).trim();
  if (!query) throw new Error("query is required.");
  const limit = asInt(args.limit, 12, 1, 30);
  const result = await searchFreeLlmCatalog(query, limit);
  const summary = result.results.length
    ? [`Catalog: ${result.providerCount} providers | synced ${result.syncedAt}`, ...result.results.map((item) => `${item.provider} [${item.access}] score=${item.score}\n${item.model}${item.notes.length ? `\n${item.notes.join("; ")}` : ""}${item.url ? `\n${item.url}` : ""}`)].join("\n\n")
    : `No free/trial LLM matches for “${query}”.`;
  return { ok: true, tool: "llm.resources.search", summary: truncate(summary), data: result };
}

async function llmModelsTool(): Promise<ToolExecutionResult> {
  const status = modelRouterStatus();
  const routes = status.configuredRoutes;
  const summary = routes.length
    ? [`Routing mode: ${status.mode}`, `Providers: ${status.providers.join(", ") || "—"}`, "", ...routes.map((r) => `${r.provider}/${r.model} | origin=${r.origin} | free=${r.free} | protocol=${r.protocol} | ${r.reason}`)].join("\n")
    : `No real model routes configured. Add OPENAI_API_KEY, DEEPSEEK_API_KEY, DASHSCOPE_API_KEY, OPENROUTER_API_KEY, or JARVIS_OLLAMA_MODELS.`;
  return { ok: true, tool: "llm.models", summary, data: status };
}

async function llmRouteTool(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const query = asString(args.query).trim();
  if (!query) throw new Error("query is required.");
  const limit = asInt(args.limit, 8, 1, 12);
  const result = routeModels(query, limit);
  const summary = result.routes.length
    ? [`Task=${result.task} | mode=${result.mode}`, ...result.routes.map((item, index) => `${index + 1}. ${item.route.provider}/${item.route.model} score=${item.score.toFixed(1)} free=${item.route.free} origin=${item.route.origin} — ${item.route.reason}`)].join("\n")
    : `No configured model route is eligible for this task.`;
  return { ok: true, tool: "llm.route", summary, data: { task: result.task, mode: result.mode, routes: result.routes.map(({ route, score }) => ({ ...route, apiKey: undefined, score })) } };
}

export function getToolDefinition(name: string) {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name) || null;
}

export function toolCatalogForPrompt() {
  return TOOL_DEFINITIONS.map((tool) => `- ${tool.name} [${tool.risk}]: ${tool.description} Args: ${tool.args}`).join("\n");
}

export async function prepareToolApproval(call: ToolCall): Promise<{ call: ToolCall; preview?: string }> {
  const definition = getToolDefinition(call.tool);
  if (!definition || definition.risk !== "approval") throw new Error("Tool is not approval-gated.");
  if (call.tool === "workspace.patch") return preparePatch(call);
  if (call.tool === "workspace.createFile") return prepareCreateFile(call);
  if (call.tool === "api.skill.register") return prepareApiSkill(call);
  const knowledgePrepared = await prepareKnowledgeApproval(call);
  if (knowledgePrepared) return knowledgePrepared;
  const devicePrepared = await prepareDeviceApproval(call);
  if (devicePrepared) return devicePrepared;
  return { call };
}

export async function executeTool(call: ToolCall): Promise<ToolExecutionResult> {
  const definition = getToolDefinition(call.tool);
  if (!definition) return { ok: false, tool: call.tool, summary: "Unknown tool.", error: "Unknown tool." };
  const security = await securityState();
  if (security.lockdown && definition.risk === "approval" && call.tool !== "core.security.lockdown") {
    return { ok: false, tool: call.tool, summary: "Global lockdown is active; approval-gated actions are disabled.", error: "lockdown" };
  }
  const traceStarted=Date.now();
  await audit({ event: "tool.start", tool: call.tool, detail: call.reason?.slice(0, 300) });
  await traceEvent({kind:"tool.start",tool:call.tool,status:"running",meta:{reason:call.reason?.slice(0,300)}});
  try {
    let result: ToolExecutionResult;
    if (call.tool.startsWith("core.")) result = await executeCoreTool(call);
    else if (call.tool.startsWith("reach.")) result = await executeReachTool(call);
    else if (call.tool.startsWith("research.")) result = await executeResearchTool(call);
    else if (call.tool.startsWith("trading.")) result = await executeTradingTool(call);
    else if (call.tool.startsWith("domain.")) result = await executeDomainTool(call);
    else if (call.tool === "telegram.send") { try { const data = await telegramSend(String(call.args.text || ""), call.args.chatId ? String(call.args.chatId) : undefined); result = { ok: true, tool: call.tool, summary: "Telegram alert sent.", data }; } catch (error) { result = { ok: false, tool: call.tool, summary: `Telegram send failed: ${error instanceof Error ? error.message : "unknown"}`, error: error instanceof Error ? error.message : "unknown" }; } }
    else switch (call.tool) {
      case "system.info": result = await systemInfo(); break;
      case "workspace.list": result = await workspaceList(call.args); break;
      case "workspace.read": result = await workspaceRead(call.args); break;
      case "workspace.search": result = await workspaceSearch(call.args); break;
      case "project.index": result = await projectIndex(); break;
      case "project.retrieve": result = await projectRetrieve(call.args); break;
      case "project.review": result = await projectReviewTool(); break;
      case "git.status": result = await runGit(["status", "--short", "--branch"], call.tool); break;
      case "git.diff": result = await runGit(["diff", "--no-ext-diff", "--"], call.tool); break;
      case "workspace.patch": result = await executePatch(call.args); break;
      case "workspace.createFile": result = await executeCreateFile(call.args); break;
      case "project.check": result = await projectCheck(call.args); break;
      case "system.openApp": result = await openApplication(call.args); break;
      case "github.repo": result = await githubRepo(call.args); break;
      case "github.file": result = await githubFile(call.args); break;
      case "supabase.select": result = await supabaseSelect(call.args); break;
      case "api.catalog.sync": result = await apiCatalogSyncTool(); break;
      case "api.catalog.search": result = await apiCatalogSearchTool(call.args); break;
      case "internet.fetch": result = await internetFetch(call.args); break;
      case "api.skill.list": result = await apiSkillListTool(); break;
      case "api.skill.run": result = await apiSkillRunTool(call.args); break;
      case "api.skill.register": result = await executeApiSkillRegister(call.args); break;
      case "learning.search": result = await learningSearchTool(call.args); break;
      case "learning.stats": result = await learningStatsTool(); break;
      case "llm.resources.sync": result = await llmResourcesSyncTool(); break;
      case "llm.resources.search": result = await llmResourcesSearchTool(call.args); break;
      case "llm.models": result = await llmModelsTool(); break;
      case "llm.route": result = await llmRouteTool(call.args); break;
      default: {
        const knowledgeResult = await executeKnowledgeTool(call);
        if (knowledgeResult) { result = knowledgeResult; break; }
        const deviceResult = await deviceTool(call);
        result = deviceResult || { ok: false, tool: call.tool, summary: "Tool not implemented.", error: "Tool not implemented." };
      }
    }
    await audit({ event: "tool.finish", tool: call.tool, ok: result.ok, detail: result.summary.slice(0, 500) });
    await traceEvent({kind:"tool.finish",tool:call.tool,status:result.ok?"ok":"error",durationMs:Date.now()-traceStarted,meta:{summary:result.summary.slice(0,500)}});
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool error";
    await audit({ event: "tool.finish", tool: call.tool, ok: false, detail: message.slice(0, 500) });
    await traceEvent({kind:"tool.finish",tool:call.tool,status:"error",durationMs:Date.now()-traceStarted,meta:{error:message.slice(0,500)}});
    return { ok: false, tool: call.tool, summary: message, error: message };
  }
}
