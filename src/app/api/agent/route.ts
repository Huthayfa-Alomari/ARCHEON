import { NextResponse } from "next/server";
import { answerFromToolResult, generateReply, planAgentStep, type ChatTurn } from "@/lib/jarvis/llm";
import { recall } from "@/lib/jarvis/memory";
import { buildSystemPrompt } from "@/lib/jarvis/prompt";
import { tryBuiltInTool } from "@/lib/jarvis/tools";
import { createApproval } from "@/lib/jarvis/approvals";
import { audit } from "@/lib/jarvis/audit";
import { executeTool, getToolDefinition, prepareToolApproval } from "@/lib/jarvis/tool-registry";
import { jarvisConfig } from "@/lib/jarvis/config";
import { learn, searchLearned } from "@/lib/jarvis/learning";
import { searchCouncilMemory } from "@/lib/jarvis/cognitive-memory";
import { generateCouncilReply, shouldUseCouncil } from "@/lib/jarvis/council";
import { searchKnowledge } from "@/lib/jarvis/knowledge-store";
import type { AgentApproval, ToolCall, ToolObservation } from "@/lib/jarvis/types";

export const runtime = "nodejs";
type Body = { message?: string; history?: ChatTurn[] };


function isSensitiveInput(message: string) {
  return /^(?:\/(?:health|pair|devices|mesh|permissions|browser)\b)|(?:heart[ -]?rate|blood[ -]?pressure|oxygen[ -]?saturation|health connect|meta glasses|browser skill|browser session|نبض|ضغط(?:\s+الدم)?|أكسجين|اكسجين|صحتي|الصحة|نومي|النوم|نظارة|النظارة)/iu.test(message.trim());
}

function learningSourceForTool(tool: string) {
  if (tool.startsWith("api.") || tool === "internet.fetch") return "api" as const;
  if (tool.startsWith("workspace.") || tool.startsWith("project.") || tool.startsWith("git.") || tool.startsWith("github.")) return "workspace" as const;
  return "tool" as const;
}

async function approvalResponse(call: ToolCall, userMessage: string, trace: string[] = []) {
  const definition = getToolDefinition(call.tool);
  if (!definition || definition.risk !== "approval") throw new Error("Tool is not approval-gated.");
  const prepared = await prepareToolApproval(call);
  const pending = await createApproval(prepared.call, userMessage, prepared.preview);
  await audit({ event: "approval.requested", tool: call.tool, approvalId: pending.id, detail: call.reason?.slice(0, 300) });
  const approval: AgentApproval = { id: pending.id, tool: call.tool, reason: call.reason || definition.description, expiresAt: pending.expiresAt, argsPreview: prepared.call.args, preview: prepared.preview };
  return NextResponse.json({
    reply: prepared.preview ? `جهزت معاينة للإجراء. راجعها ثم وافق أو ارفض: ${call.tool}` : `هذا الإجراء يحتاج موافقتك قبل التنفيذ: ${call.tool}`,
    source: "approval", approval, trace,
  });
}

async function handleDirectTool(call: ToolCall, userMessage: string, history: ChatTurn[], system: string) {
  const definition = getToolDefinition(call.tool);
  if (!definition) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  if (definition.risk === "approval") return approvalResponse(call, userMessage, [call.tool]);
  const result = await executeTool(call);
  if (result.sensitivity === "health" || result.sensitivity === "private") {
    return NextResponse.json({ reply: result.summary, source: result.sensitivity === "health" ? "health-vault" : "private-tool", trace: [call.tool], toolResult: { ok: result.ok, tool: result.tool, sensitivity: result.sensitivity } });
  }
  const isKnowledgeTool = result.tool.startsWith("knowledge.");
  if (!isKnowledgeTool) await learn(result.summary, learningSourceForTool(result.tool), { sourceRef: result.tool, reliability: result.ok ? 0.9 : 0.55 });
  const reply = await answerFromToolResult({ system, history, message: userMessage, toolResult: result });
  if (!isKnowledgeTool) await learn(reply, "assistant", { sourceRef: `reply:${result.tool}`, reliability: 0.55 });
  return NextResponse.json({ reply, source: "tool", trace: [call.tool], toolResult: { ok: result.ok, tool: result.tool } });
}

async function councilOrFallback(args: {
  system: string;
  history: ChatTurn[];
  message: string;
  observations: ToolObservation[];
  forceCouncil: boolean;
  fallback?: string;
  trace: string[];
}) {
  if (shouldUseCouncil(args.message, args.forceCouncil)) {
    const council = await generateCouncilReply({ system: args.system, history: args.history, message: args.message, observations: args.observations, force: args.forceCouncil });
    if (council) {
      const reliability = Math.max(0.5, Math.min(0.9, 0.5 + council.meta.confidence * 0.22 + council.meta.consensus * 0.12));
      await learn(council.answer, "assistant", { sourceRef: `council:${council.meta.sessionId}`, reliability });
      return NextResponse.json({ reply: council.answer, source: "council", trace: args.trace, council: council.meta });
    }
  }
  const reply = args.fallback || await generateReply({ system: args.system, history: args.history, message: args.message, observations: args.observations });
  await learn(reply, "assistant", { sourceRef: args.observations.length ? "agent-loop-final" : "llm", reliability: 0.55 });
  return NextResponse.json({ reply, source: args.observations.length ? "agent-loop" : "llm", trace: args.trace });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    let message = body.message?.trim();
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

    let forceCouncil = false;
    const forced = message.match(/^\/council\s+(?:ask\s+)?([\s\S]+)$/i);
    if (forced?.[1] && !/^status$/i.test(forced[1].trim())) {
      forceCouncil = true;
      message = forced[1].trim();
    }

    const sensitiveInput = isSensitiveInput(message);
    if (!sensitiveInput) await learn(message, "user", { sourceRef: "conversation", reliability: 0.8 });
    const [memory, learned, councilMemory, knowledge] = sensitiveInput
      ? [[], [], [], []]
      : await Promise.all([recall(12), searchLearned(message, 8), searchCouncilMemory(message, 4), searchKnowledge(message, 8)]);
    const history = Array.isArray(body.history) ? body.history.slice(-16) : [];
    const system = buildSystemPrompt(memory, learned, councilMemory, knowledge);

    const builtIn = await tryBuiltInTool(message);
    if (builtIn.handled) {
      if ("response" in builtIn) {
        if (!sensitiveInput) await learn(builtIn.response, "assistant", { sourceRef: "builtin", reliability: 0.65 });
        return NextResponse.json({ reply: builtIn.response, source: "builtin" });
      }
      return handleDirectTool(builtIn.toolCall, message, history, system);
    }

    const observations: ToolObservation[] = [];
    const seenCalls = new Set<string>();
    const trace: string[] = [];

    for (let step = 0; step < jarvisConfig.maxAgentSteps; step += 1) {
      const decision = await planAgentStep({ system, history, message, observations });
      if (!decision) break;
      if (decision.kind === "reply") {
        if (sensitiveInput) return NextResponse.json({ reply: decision.reply, source: "private-agent", trace });
        return councilOrFallback({ system, history, message, observations, forceCouncil, fallback: decision.reply, trace });
      }

      const signature = `${decision.call.tool}:${JSON.stringify(decision.call.args)}`;
      if (seenCalls.has(signature)) {
        observations.push({ tool: decision.call.tool, ok: false, summary: "Runtime stopped a repeated identical tool call to prevent an agent loop." });
        break;
      }
      seenCalls.add(signature);
      trace.push(decision.call.tool);

      const definition = getToolDefinition(decision.call.tool);
      if (!definition) { observations.push({ tool: decision.call.tool, ok: false, summary: "Unknown tool." }); continue; }
      if (definition.risk === "approval") {
        try { return await approvalResponse(decision.call, message, trace); }
        catch (error) { observations.push({ tool: decision.call.tool, ok: false, summary: `Approval preparation failed: ${error instanceof Error ? error.message : "unknown"}` }); continue; }
      }

      const result = await executeTool(decision.call);
      if (result.sensitivity === "health" || result.sensitivity === "private") {
        return NextResponse.json({ reply: result.summary, source: result.sensitivity === "health" ? "health-vault" : "private-tool", trace, toolResult: { ok: result.ok, tool: result.tool, sensitivity: result.sensitivity } });
      }
      observations.push({ tool: result.tool, ok: result.ok, summary: result.summary });
      if (!result.tool.startsWith("knowledge.")) await learn(result.summary, learningSourceForTool(result.tool), { sourceRef: result.tool, reliability: result.ok ? 0.9 : 0.5 });
    }

    if (sensitiveInput) {
      const reply = await generateReply({ system, history, message, observations });
      return NextResponse.json({ reply, source: "private-agent", trace });
    }
    return councilOrFallback({ system, history, message, observations, forceCouncil, trace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await audit({ event: "agent.error", ok: false, detail: message.slice(0, 500) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
