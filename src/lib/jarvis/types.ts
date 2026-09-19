export type ToolRisk = "read" | "approval";

export type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  reason?: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  tool: string;
  summary: string;
  data?: unknown;
  error?: string;
  sensitivity?: "normal" | "private" | "health";
};

export type PendingApproval = {
  id: string;
  createdAt: string;
  expiresAt: string;
  toolCall: ToolCall;
  userMessage: string;
  preview?: string;
};

export type AgentApproval = {
  id: string;
  tool: string;
  reason: string;
  expiresAt: string;
  argsPreview: Record<string, unknown>;
  preview?: string;
};

export type ToolObservation = {
  tool: string;
  ok: boolean;
  summary: string;
};
