import path from "node:path";

export type Provider = "mock" | "auto" | "ollama" | "openai" | "openai-compatible" | "vercel-ai-gateway" | "deepseek" | "alibaba" | "openrouter";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type RoutingMode = "single" | "auto" | "quality" | "economy" | "china" | "free" | "local";
export type CouncilMode = "off" | "auto" | "always" | "manual";

function boolEnv(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function reasoningEnv(value: string | undefined): ReasoningEffort {
  const allowed: ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];
  return allowed.includes(value as ReasoningEffort) ? value as ReasoningEffort : "max";
}

function routingEnv(value: string | undefined): RoutingMode {
  const allowed: RoutingMode[] = ["single", "auto", "quality", "economy", "china", "free", "local"];
  return allowed.includes(value as RoutingMode) ? value as RoutingMode : "auto";
}

function councilEnv(value: string | undefined): CouncilMode {
  const allowed: CouncilMode[] = ["off", "auto", "always", "manual"];
  return allowed.includes(value as CouncilMode) ? value as CouncilMode : "always";
}

const provider = (process.env.JARVIS_LLM_PROVIDER || "mock") as Provider;
const defaultBaseUrl = provider === "openai"
  ? "https://api.openai.com"
  : provider === "deepseek"
    ? "https://api.deepseek.com"
    : provider === "alibaba"
      ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
      : provider === "openrouter"
        ? "https://openrouter.ai/api"
        : provider === "vercel-ai-gateway"
          ? "https://ai-gateway.vercel.sh"
          : "http://127.0.0.1:11434";

const defaultModel = provider === "openai"
  ? "gpt-5.6-sol"
  : provider === "deepseek"
    ? "deepseek-v4-pro"
    : provider === "alibaba"
      ? "qwen3.8-max"
      : "";

export const jarvisConfig = {
  provider,
  routingMode: routingEnv(process.env.JARVIS_MODEL_ROUTING),
  baseUrl: process.env.JARVIS_LLM_BASE_URL || defaultBaseUrl,
  model: process.env.JARVIS_LLM_MODEL || defaultModel,
  modelFallbacks: (process.env.JARVIS_LLM_FALLBACKS || "").split(",").map((v) => v.trim()).filter(Boolean),
  reasoningEffort: reasoningEnv(process.env.JARVIS_REASONING_EFFORT),
  apiKey: process.env.JARVIS_LLM_API_KEY || "",

  // Multi-model council / debate. maxModels=0 means every configured route.
  councilMode: councilEnv(process.env.JARVIS_COUNCIL_MODE),
  councilMaxModels: intEnv(process.env.JARVIS_COUNCIL_MAX_MODELS, 0, 0, 64),
  councilMinModels: intEnv(process.env.JARVIS_COUNCIL_MIN_MODELS, 2, 1, 12),
  councilConcurrency: intEnv(process.env.JARVIS_COUNCIL_CONCURRENCY, 6, 1, 16),
  councilTimeoutMs: intEnv(process.env.JARVIS_COUNCIL_TIMEOUT_MS, 90_000, 5_000, 240_000),
  councilCritiqueRound: boolEnv(process.env.JARVIS_COUNCIL_CRITIQUE_ROUND, true),

  // Multi-provider model router credentials. All are optional.
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  alibabaApiKey: process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_MODEL_STUDIO_API_KEY || "",
  alibabaBaseUrl: process.env.ALIBABA_MODEL_STUDIO_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  ollamaModels: (process.env.JARVIS_OLLAMA_MODELS || process.env.OLLAMA_MODELS || "").split(",").map((v) => v.trim()).filter(Boolean),

  memoryPath: process.env.JARVIS_MEMORY_PATH || "./data/memory.json",
  learningPath: process.env.JARVIS_LEARNING_PATH || "./data/learning.json",
  cognitiveMemoryPath: process.env.JARVIS_COGNITIVE_MEMORY_PATH || "./data/cognitive-memory.json",
  modelPerformancePath: process.env.JARVIS_MODEL_PERFORMANCE_PATH || "./data/model-performance.json",
  deviceMeshPath: process.env.JARVIS_DEVICE_MESH_PATH || "./data/device-mesh.json",
  deviceMeshKeyPath: process.env.JARVIS_DEVICE_MESH_KEY_PATH || "./data/.device-mesh.key",
  devicePermissionsPath: process.env.JARVIS_DEVICE_PERMISSIONS_PATH || "./data/device-permissions.json",
  healthVaultPath: process.env.JARVIS_HEALTH_VAULT_PATH || "./data/health-vault.jsonl",
  apiCatalogPath: process.env.JARVIS_API_CATALOG_PATH || "./data/public-apis.json",
  apiSkillsPath: process.env.JARVIS_API_SKILLS_PATH || "./data/api-skills.json",
  freeLlmCatalogPath: process.env.JARVIS_FREE_LLM_CATALOG_PATH || "./data/free-llm-resources.json",
  knowledgeStorePath: process.env.JARVIS_KNOWLEDGE_STORE_PATH || "./data/knowledge-store.json",
  approvalsPath: process.env.JARVIS_APPROVALS_PATH || "./data/approvals.json",
  auditPath: process.env.JARVIS_AUDIT_PATH || "./data/audit.jsonl",
  backupPath: process.env.JARVIS_BACKUP_PATH || "./data/backups",
  timezone: process.env.JARVIS_TIMEZONE || "Asia/Amman",
  workspacePath: path.resolve(process.env.JARVIS_WORKSPACE_PATH || process.cwd()),
  maxReadBytes: intEnv(process.env.JARVIS_MAX_READ_BYTES, 120_000, 8_000, 2_000_000),
  maxWriteBytes: intEnv(process.env.JARVIS_MAX_WRITE_BYTES, 240_000, 8_000, 4_000_000),
  maxSearchFiles: intEnv(process.env.JARVIS_MAX_SEARCH_FILES, 500, 20, 5000),
  maxIndexFiles: intEnv(process.env.JARVIS_MAX_INDEX_FILES, 1500, 50, 20_000),
  maxAgentSteps: intEnv(process.env.JARVIS_MAX_AGENT_STEPS, 8, 1, 12),
  maxLearningItems: intEnv(process.env.JARVIS_MAX_LEARNING_ITEMS, 5000, 100, 50_000),
  maxKnowledgeChunks: intEnv(process.env.JARVIS_MAX_KNOWLEDGE_CHUNKS, 20_000, 500, 200_000),
  knowledgeChunkChars: intEnv(process.env.JARVIS_KNOWLEDGE_CHUNK_CHARS, 3200, 800, 12_000),
  knowledgeChunkOverlap: intEnv(process.env.JARVIS_KNOWLEDGE_CHUNK_OVERLAP, 320, 0, 2000),
  maxKnowledgeFileBytes: intEnv(process.env.JARVIS_MAX_KNOWLEDGE_FILE_BYTES, 8_000_000, 100_000, 50_000_000),
  apiCatalogRefreshHours: intEnv(process.env.JARVIS_API_CATALOG_REFRESH_HOURS, 168, 1, 24 * 30),
  freeLlmCatalogRefreshHours: intEnv(process.env.JARVIS_FREE_LLM_REFRESH_HOURS, 72, 1, 24 * 30),
  approvalTtlMinutes: intEnv(process.env.JARVIS_APPROVAL_TTL_MINUTES, 10, 1, 60),
  devicePairingTtlMinutes: intEnv(process.env.JARVIS_DEVICE_PAIRING_TTL_MINUTES, 5, 1, 30),
  permissionRequestTtlMinutes: intEnv(process.env.JARVIS_PERMISSION_REQUEST_TTL_MINUTES, 15, 1, 120),
  deviceOfflineAfterMs: intEnv(process.env.JARVIS_DEVICE_OFFLINE_AFTER_SECONDS, 120, 30, 3600) * 1000,
  enableOsActions: boolEnv(process.env.JARVIS_ENABLE_OS_ACTIONS, false),
  allowSecretFiles: boolEnv(process.env.JARVIS_ALLOW_SECRET_FILES, false),
  learningEnabled: boolEnv(process.env.JARVIS_LEARNING_ENABLED, true),
  githubToken: process.env.JARVIS_GITHUB_TOKEN || "",
  supabaseUrl: process.env.JARVIS_SUPABASE_URL || "",
  supabaseKey: process.env.JARVIS_SUPABASE_KEY || "",
  deviceMeshSecret: process.env.JARVIS_DEVICE_MESH_SECRET || "",
  healthVaultKey: process.env.JARVIS_HEALTH_VAULT_KEY || "",
  browserSkillBin: process.env.JARVIS_BROWSERSKILL_BIN || "bsk",
  agentReachBin: process.env.JARVIS_AGENT_REACH_BIN || "agent-reach",
  bossCdpUrl: process.env.JARVIS_BOSS_CDP_URL || "http://127.0.0.1:9222",
  browserSkillHome: process.env.JARVIS_BROWSERSKILL_HOME || "",
  kaggleToken: process.env.KAGGLE_API_TOKEN || process.env.KAGGLE_TOKEN || "",
  huggingFaceToken: process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "",
  fredApiKey: process.env.FRED_API_KEY || "",
  openAlexApiKey: process.env.OPENALEX_API_KEY || "",
  secUserAgent: process.env.SEC_USER_AGENT || "Huthayfa-JARVIS contact@example.com",

  researchStorePath: process.env.JARVIS_RESEARCH_STORE_PATH || "./data/research-store.json",
  tradingStatePath: process.env.JARVIS_TRADING_STATE_PATH || "./data/trading-state.json",
  mt5BridgePath: process.env.JARVIS_MT5_BRIDGE_PATH || "./bridge/mt5_bridge.py",
  pythonBin: process.env.JARVIS_PYTHON_BIN || (process.platform === "win32" ? "py" : "python3"),
  mt5Magic: intEnv(process.env.JARVIS_MT5_MAGIC, 909090, 1, 2147483647),
  maxTradeVolume: Number(process.env.JARVIS_MAX_TRADE_VOLUME || "0.10"),
  maxRiskPerTradePct: Number(process.env.JARVIS_MAX_RISK_PER_TRADE_PCT || "0.5"),
  maxDailyLossPct: Number(process.env.JARVIS_MAX_DAILY_LOSS_PCT || "2.0"),
  tradingSymbols: (process.env.JARVIS_TRADING_SYMBOLS || "XAUUSD").split(",").map((v) => v.trim().toUpperCase()).filter(Boolean),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramDefaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || "",
  telegramAllowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "").split(",").map((v) => v.trim()).filter(Boolean),
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
};
