import { jarvisConfig, type RoutingMode } from "./config";

export type ModelProtocol = "responses" | "chat" | "ollama";
export type ModelTask = "coding" | "reasoning" | "long-context" | "fast" | "general";
export type ModelOrigin = "us" | "china" | "local" | "mixed";

export type ModelRoute = {
  id: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  protocol: ModelProtocol;
  origin: ModelOrigin;
  free: boolean;
  costClass: 0 | 1 | 2 | 3;
  qualityWeight: number;
  speedWeight: number;
  tasks: ModelTask[];
  reason: string;
};

function unique<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => { const k = key(item); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function classifyModelTask(text: string): ModelTask {
  const t = text.toLowerCase();
  if (/(code|coding|typescript|javascript|python|mql5|flutter|next\.js|bug|compile|build|repo|repository|كود|برمج|مشروع|خطأ|اصلاح|إصلاح)/i.test(t)) return "coding";
  if (/(long context|large codebase|document|pdf|كتاب|ملف كبير|مستودع كامل|سياق طويل)/i.test(t)) return "long-context";
  if (/(reason|analy[sz]e|research|compare|architecture|proof|math|تحليل|بحث|قارن|منطق|استنتج)/i.test(t)) return "reasoning";
  if (/(quick|fast|brief|short|سريع|اختصر|مختصر)/i.test(t)) return "fast";
  return "general";
}

function configuredRoutes(): ModelRoute[] {
  const routes: ModelRoute[] = [];
  const effort = jarvisConfig.reasoningEffort;

  if (jarvisConfig.openaiApiKey) {
    routes.push({ id: "openai:sol", provider: "openai", model: "gpt-5.6-sol", baseUrl: "https://api.openai.com", apiKey: jarvisConfig.openaiApiKey, protocol: "responses", origin: "us", free: false, costClass: 3, qualityWeight: 100, speedWeight: 70, tasks: ["coding", "reasoning", "long-context", "general"], reason: `OpenAI flagship; reasoning=${effort}` });
    routes.push({ id: "openai:terra", provider: "openai", model: "gpt-5.6-terra", baseUrl: "https://api.openai.com", apiKey: jarvisConfig.openaiApiKey, protocol: "responses", origin: "us", free: false, costClass: 2, qualityWeight: 91, speedWeight: 82, tasks: ["coding", "reasoning", "general", "fast"], reason: "Balanced OpenAI route" });
    routes.push({ id: "openai:luna", provider: "openai", model: "gpt-5.6-luna", baseUrl: "https://api.openai.com", apiKey: jarvisConfig.openaiApiKey, protocol: "responses", origin: "us", free: false, costClass: 1, qualityWeight: 82, speedWeight: 96, tasks: ["fast", "general"], reason: "Fast/cost-sensitive OpenAI route" });
  }

  if (jarvisConfig.deepseekApiKey) {
    routes.push({ id: "deepseek:v4-pro", provider: "deepseek", model: "deepseek-v4-pro", baseUrl: "https://api.deepseek.com", apiKey: jarvisConfig.deepseekApiKey, protocol: "chat", origin: "china", free: false, costClass: 2, qualityWeight: 96, speedWeight: 70, tasks: ["coding", "reasoning", "long-context", "general"], reason: "DeepSeek flagship reasoning/coding route" });
    routes.push({ id: "deepseek:flash", provider: "deepseek", model: "deepseek-flash", baseUrl: "https://api.deepseek.com", apiKey: jarvisConfig.deepseekApiKey, protocol: "chat", origin: "china", free: false, costClass: 1, qualityWeight: 87, speedWeight: 92, tasks: ["coding", "fast", "general"], reason: "DeepSeek fast route" });
  }

  if (jarvisConfig.alibabaApiKey) {
    const base = jarvisConfig.alibabaBaseUrl;
    routes.push({ id: "alibaba:qwen-max", provider: "alibaba", model: "qwen3.8-max", baseUrl: base, apiKey: jarvisConfig.alibabaApiKey, protocol: "chat", origin: "china", free: false, costClass: 2, qualityWeight: 95, speedWeight: 76, tasks: ["reasoning", "long-context", "general", "coding"], reason: "Qwen flagship via Alibaba Model Studio" });
    routes.push({ id: "alibaba:qwen-coder", provider: "alibaba", model: "qwen3-coder-plus", baseUrl: base, apiKey: jarvisConfig.alibabaApiKey, protocol: "chat", origin: "china", free: false, costClass: 2, qualityWeight: 96, speedWeight: 74, tasks: ["coding", "long-context"], reason: "Qwen coding-specialized route" });
    routes.push({ id: "alibaba:kimi-k3", provider: "alibaba", model: "kimi-k3", baseUrl: base, apiKey: jarvisConfig.alibabaApiKey, protocol: "chat", origin: "china", free: false, costClass: 2, qualityWeight: 95, speedWeight: 72, tasks: ["reasoning", "long-context", "coding", "general"], reason: "Kimi long-context/reasoning route" });
    routes.push({ id: "alibaba:glm-5.3", provider: "alibaba", model: "glm-5.3", baseUrl: base, apiKey: jarvisConfig.alibabaApiKey, protocol: "chat", origin: "china", free: false, costClass: 2, qualityWeight: 94, speedWeight: 73, tasks: ["reasoning", "coding", "long-context", "general"], reason: "GLM agentic reasoning/coding route" });
    routes.push({ id: "alibaba:minimax-m2.5", provider: "alibaba", model: "MiniMax-M2.5", baseUrl: base, apiKey: jarvisConfig.alibabaApiKey, protocol: "chat", origin: "china", free: false, costClass: 1, qualityWeight: 88, speedWeight: 82, tasks: ["coding", "general", "fast"], reason: "MiniMax route via Alibaba Model Studio" });
    routes.push({ id: "alibaba:qwen-flash", provider: "alibaba", model: "qwen3.8-flash", baseUrl: base, apiKey: jarvisConfig.alibabaApiKey, protocol: "chat", origin: "china", free: false, costClass: 1, qualityWeight: 86, speedWeight: 95, tasks: ["fast", "general", "coding"], reason: "Fast Qwen route" });
  }

  if (jarvisConfig.openrouterApiKey) {
    const base = jarvisConfig.openrouterBaseUrl;
    routes.push({ id: "openrouter:qwen-coder-free", provider: "openrouter", model: "qwen/qwen3-coder:free", baseUrl: base, apiKey: jarvisConfig.openrouterApiKey, protocol: "chat", origin: "china", free: true, costClass: 0, qualityWeight: 82, speedWeight: 72, tasks: ["coding", "general"], reason: "Free Qwen coding route when available" });
    routes.push({ id: "openrouter:glm-free", provider: "openrouter", model: "z-ai/glm-4.5-air:free", baseUrl: base, apiKey: jarvisConfig.openrouterApiKey, protocol: "chat", origin: "china", free: true, costClass: 0, qualityWeight: 78, speedWeight: 78, tasks: ["reasoning", "general", "coding"], reason: "Free GLM route when available" });
    routes.push({ id: "openrouter:minimax-free", provider: "openrouter", model: "minimax/minimax-m2.5:free", baseUrl: base, apiKey: jarvisConfig.openrouterApiKey, protocol: "chat", origin: "china", free: true, costClass: 0, qualityWeight: 80, speedWeight: 77, tasks: ["coding", "general", "fast"], reason: "Free MiniMax route when available" });
  }

  for (const model of jarvisConfig.ollamaModels) {
    routes.push({ id: `ollama:${model}`, provider: "ollama", model, baseUrl: jarvisConfig.ollamaBaseUrl, apiKey: "", protocol: "ollama", origin: "local", free: true, costClass: 0, qualityWeight: 70, speedWeight: 65, tasks: ["coding", "reasoning", "long-context", "fast", "general"], reason: "Local/private Ollama model" });
  }

  // Legacy single-provider compatibility.
  if (jarvisConfig.provider !== "mock" && jarvisConfig.provider !== "auto" && jarvisConfig.model) {
    const provider = jarvisConfig.provider;
    const protocol: ModelProtocol = provider === "ollama" ? "ollama" : provider === "openai" ? "responses" : "chat";
    const apiKey = jarvisConfig.apiKey || (provider === "openai" ? jarvisConfig.openaiApiKey : provider === "deepseek" ? jarvisConfig.deepseekApiKey : provider === "alibaba" ? jarvisConfig.alibabaApiKey : provider === "openrouter" ? jarvisConfig.openrouterApiKey : "");
    routes.push({ id: `legacy:${provider}:${jarvisConfig.model}`, provider, model: jarvisConfig.model, baseUrl: jarvisConfig.baseUrl, apiKey, protocol, origin: provider === "ollama" ? "local" : provider === "deepseek" || provider === "alibaba" ? "china" : "mixed", free: provider === "ollama", costClass: provider === "ollama" ? 0 : 2, qualityWeight: 90, speedWeight: 75, tasks: ["coding", "reasoning", "long-context", "fast", "general"], reason: "Legacy configured primary model" });
    for (const model of jarvisConfig.modelFallbacks) routes.push({ id: `legacy:${provider}:${model}`, provider, model, baseUrl: jarvisConfig.baseUrl, apiKey, protocol, origin: provider === "ollama" ? "local" : provider === "deepseek" || provider === "alibaba" ? "china" : "mixed", free: provider === "ollama", costClass: provider === "ollama" ? 0 : 2, qualityWeight: 84, speedWeight: 75, tasks: ["coding", "reasoning", "long-context", "fast", "general"], reason: "Legacy fallback model" });
  }

  return unique(routes, (route) => `${route.provider}|${route.baseUrl}|${route.model}`);
}

function policyScore(route: ModelRoute, task: ModelTask, mode: RoutingMode) {
  let score = route.qualityWeight + (route.tasks.includes(task) ? 24 : 0);
  if (task === "fast") score += route.speedWeight * 0.55;
  if (mode === "quality") score += route.qualityWeight * 0.65 - route.costClass * 2;
  if (mode === "economy") score += (3 - route.costClass) * 18 + (route.free ? 22 : 0) + route.speedWeight * 0.15;
  if (mode === "free") score += route.free ? 100 : -1000;
  if (mode === "local") score += route.origin === "local" ? 100 : -1000;
  if (mode === "china") score += route.origin === "china" ? 70 : -1000;
  if (mode === "auto") score += route.qualityWeight * 0.35 - route.costClass * 3 + (task === "fast" ? route.speedWeight * 0.2 : 0);
  return score;
}

export function routeModels(message: string, limit = 8) {
  const task = classifyModelTask(message);
  const mode = jarvisConfig.routingMode === "single" ? "quality" : jarvisConfig.routingMode;
  let all = configuredRoutes();
  if (jarvisConfig.routingMode === "single") {
    const legacy = all.filter((route) => route.id.startsWith("legacy:"));
    all = legacy.length ? legacy : all.slice(0, 1);
  }
  const scored = all.map((route) => ({ route, score: policyScore(route, task, mode) }))
    .filter((item) => item.score > -500)
    .sort((a, b) => b.score - a.score || a.route.id.localeCompare(b.route.id))
    .slice(0, Math.max(1, limit));
  return { task, mode: jarvisConfig.routingMode, routes: scored };
}

export function modelRouterStatus() {
  const routes = configuredRoutes();
  return {
    mode: jarvisConfig.routingMode,
    configuredRoutes: routes.map(({ apiKey: _apiKey, ...route }) => ({ ...route, credentialConfigured: Boolean(_apiKey) || route.protocol === "ollama" })),
    providers: [...new Set(routes.map((r) => r.provider))],
  };
}
