import { NextResponse } from "next/server";
import { jarvisConfig } from "@/lib/jarvis/config";
import { learningStats } from "@/lib/jarvis/learning";
import { getPublicApiCatalog } from "@/lib/jarvis/public-api-catalog";
import { listApiSkills } from "@/lib/jarvis/api-skills";
import { getFreeLlmCatalog } from "@/lib/jarvis/free-llm-catalog";
import { modelRouterStatus } from "@/lib/jarvis/model-router";
import { cognitiveMemoryStats } from "@/lib/jarvis/cognitive-memory";
import { modelPerformanceSummary } from "@/lib/jarvis/model-performance";
import { deviceMeshStatus } from "@/lib/jarvis/device-mesh";
import { healthVaultStatus } from "@/lib/jarvis/health-vault";

export const runtime = "nodejs";

export async function GET() {
  const [learning, catalog, apiSkills, llmCatalog, cognitive, performance, deviceMesh] = await Promise.all([
    learningStats(), getPublicApiCatalog(false), listApiSkills(), getFreeLlmCatalog(false), cognitiveMemoryStats(), modelPerformanceSummary(), deviceMeshStatus(),
  ]);
  const router = modelRouterStatus();
  return NextResponse.json({
    ok: true,
    version: "1.5.0",
    provider: jarvisConfig.provider,
    model: jarvisConfig.model || null,
    routingMode: jarvisConfig.routingMode,
    reasoningEffort: jarvisConfig.reasoningEffort,
    modelConfigured: router.configuredRoutes.length > 0 || jarvisConfig.provider === "mock",
    modelFleet: { routes: router.configuredRoutes.length, providers: router.providers },
    council: { mode: jarvisConfig.councilMode, maxModels: jarvisConfig.councilMaxModels, minModels: jarvisConfig.councilMinModels, concurrency: jarvisConfig.councilConcurrency, critiqueRound: jarvisConfig.councilCritiqueRound, sessions: cognitive.sessions, performanceProfiles: performance.length },
    deviceMesh,
    healthVault: healthVaultStatus(),
    osActions: jarvisConfig.enableOsActions,
    secretFilesBlocked: !jarvisConfig.allowSecretFiles,
    maxAgentSteps: jarvisConfig.maxAgentSteps,
    learning,
    publicApis: { count: catalog.entries.length, syncedAt: catalog.syncedAt || null, skills: apiSkills.length },
    freeLlms: { providers: llmCatalog.providers.length, syncedAt: llmCatalog.syncedAt || null },
    connectors: {
      github: true,
      githubAuthenticated: Boolean(jarvisConfig.githubToken),
      supabase: Boolean(jarvisConfig.supabaseUrl && jarvisConfig.supabaseKey),
      internetSafeFetch: true,
      publicApiCatalog: true,
      freeLlmCatalog: true,
      openai: Boolean(jarvisConfig.openaiApiKey),
      deepseek: Boolean(jarvisConfig.deepseekApiKey),
      alibaba: Boolean(jarvisConfig.alibabaApiKey),
      openrouter: Boolean(jarvisConfig.openrouterApiKey),
      ollama: jarvisConfig.ollamaModels.length > 0,
    },
    capabilities: [
      "device-mesh", "android-companion", "health-connect-bridge", "encrypted-health-vault", "permission-broker", "browser-skill-adapter", "meta-wearables-adapter",
      "adaptive-model-router", "multi-model-council", "cross-examination", "council-arbiter", "cognitive-memory", "model-performance-learning", "user-feedback-learning", "gpt-5.6-sol-ready", "deepseek-v4-ready", "qwen-ready", "kimi-ready", "glm-ready", "minimax-ready",
      "free-llm-resource-catalog", "provider-failover", "task-aware-routing", "cost-aware-routing", "local-model-routing",
      "high-reasoning", "chat", "browser-voice", "explicit-memory", "self-learning-evidence-store", "provenance-retrieval",
      "workspace-read", "workspace-search", "project-index", "project-retrieval", "project-review", "multi-step-agent", "git-read",
      "autonomous-cognition", "belief-graph", "inner-thought-queue", "curiosity-engine", "reflection-engine", "goal-generator", "idle-cycle", "authority-governor", "approval-gateway", "approval-inbox", "global-lockdown", "mission-dag", "agent-teams", "memory-v2", "eval-harness", "docker-sandbox", "plugin-registry", "command-center", "computer-agent", "distributed-mesh-workers", "wake-word", "claim-graph", "book-intelligence", "portfolio-analytics", "microstructure-analytics", "coding-workflow", "vision-pipeline", "iot-planner", "diff-preview", "approval-gated-patch", "approval-gated-file-create", "patch-backups", "project-checks",
      "github-read", "supabase-read", "public-api-catalog", "safe-internet-fetch", "api-skill-factory", "audit-log", "secret-file-blocking",
    ],
  });
}
