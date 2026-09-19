import { NextResponse } from "next/server";
import { rejectApproval, takeApproval } from "@/lib/jarvis/approvals";
import { audit } from "@/lib/jarvis/audit";
import { executeTool, getToolDefinition } from "@/lib/jarvis/tool-registry";
import { answerFromToolResult } from "@/lib/jarvis/llm";
import { recall } from "@/lib/jarvis/memory";
import { buildSystemPrompt } from "@/lib/jarvis/prompt";
import { learn, searchLearned } from "@/lib/jarvis/learning";

export const runtime = "nodejs";
type Body = { id?: string; decision?: "approve" | "reject" };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.id || !body.decision) return NextResponse.json({ error: "id and decision are required" }, { status: 400 });

    if (body.decision === "reject") {
      const found = await rejectApproval(body.id);
      await audit({ event: "approval.rejected", approvalId: body.id, ok: found });
      return NextResponse.json({ reply: found ? "تم رفض الإجراء ولم يتم تنفيذه." : "طلب الموافقة غير موجود أو انتهت صلاحيته.", source: "approval" });
    }

    const approval = await takeApproval(body.id);
    if (!approval) return NextResponse.json({ error: "Approval not found or expired." }, { status: 404 });
    const definition = getToolDefinition(approval.toolCall.tool);
    if (!definition || definition.risk !== "approval") {
      await audit({ event: "approval.invalid", approvalId: body.id, tool: approval.toolCall.tool, ok: false });
      return NextResponse.json({ error: "Approval is invalid." }, { status: 400 });
    }

    await audit({ event: "approval.approved", approvalId: body.id, tool: approval.toolCall.tool, ok: true });
    const result = await executeTool(approval.toolCall);
    if (result.sensitivity === "health" || result.sensitivity === "private") {
      return NextResponse.json({ reply: result.summary, source: result.sensitivity === "health" ? "health-vault" : "private-tool", toolResult: { ok: result.ok, tool: result.tool, sensitivity: result.sensitivity } });
    }
    const isKnowledgeTool = approval.toolCall.tool.startsWith("knowledge.");
    if (!isKnowledgeTool) await learn(result.summary, approval.toolCall.tool.startsWith("api.") ? "api" : "tool", { sourceRef: approval.toolCall.tool, reliability: result.ok ? 0.92 : 0.5 });
    const [memory, learned] = await Promise.all([recall(12), searchLearned(approval.userMessage, 8)]);
    const system = buildSystemPrompt(memory, learned);
    const reply = await answerFromToolResult({ system, history: [], message: approval.userMessage, toolResult: result });
    if (!isKnowledgeTool) await learn(reply, "assistant", { sourceRef: `approved:${result.tool}`, reliability: 0.55 });
    return NextResponse.json({ reply, source: "approved-tool", toolResult: { ok: result.ok, tool: result.tool } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown approval error" }, { status: 500 });
  }
}
