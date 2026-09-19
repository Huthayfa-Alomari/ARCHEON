"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

type CouncilMeta = {
  sessionId: string;
  mode: string;
  task: string;
  modelsAsked: number;
  modelsAnswered: number;
  modelsFailed: number;
  rounds: number;
  consensus: number;
  confidence: number;
  arbiter?: string;
  disagreements?: string[];
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  source?: string;
  trace?: string[];
  council?: CouncilMeta;
  feedback?: "good" | "bad";
};
type AgentApproval = {
  id: string;
  tool: string;
  reason: string;
  expiresAt: string;
  argsPreview: Record<string, unknown>;
  preview?: string;
};
type Status = {
  provider?: string;
  model?: string | null;
  reasoningEffort?: string;
  routingMode?: string;
  modelFleet?: { routes?: number; providers?: string[] };
  council?: { mode?: string; maxModels?: number; minModels?: number; concurrency?: number; critiqueRound?: boolean; sessions?: number; performanceProfiles?: number };
  ok?: boolean;
  version?: string;
  osActions?: boolean;
  secretFilesBlocked?: boolean;
  maxAgentSteps?: number;
  learning?: { enabled?: boolean; count?: number; max?: number };
  publicApis?: { count?: number; syncedAt?: string | null; skills?: number };
  freeLlms?: { providers?: number; syncedAt?: string | null };
  deviceMesh?: { enabled?: boolean; devices?: number; online?: number; revoked?: number; kinds?: string[] };
  healthVault?: { configured?: boolean; isolatedFromGeneralMemory?: boolean; encryption?: string };
  connectors?: { github?: boolean; githubAuthenticated?: boolean; supabase?: boolean; internetSafeFetch?: boolean; publicApiCatalog?: boolean; freeLlmCatalog?: boolean; openai?: boolean; deepseek?: boolean; alibaba?: boolean; openrouter?: boolean; ollama?: boolean };
};
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => RecognitionLike;
    SpeechRecognition?: new () => RecognitionLike;
  }
}

const intro: Message = {
  id: "intro",
  role: "assistant",
  content: "ARCHEON Core v1.3 online.\nMulti-model council + cross-examination + arbiter + performance learning ready. جرّب /council status أو اسأل أي سؤال.",
  at: new Date().toISOString(),
  source: "core",
};

const quickCommands = ["/mesh", "/devices", "/pair Android-Phone", "/health heart_rate", "/browser status", "/council status"];

export function JarvisConsole() {
  const [messages, setMessages] = useState<Message[]>([intro]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approval, setApproval] = useState<AgentApproval | null>(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const recognition = useRef<RecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => setStatus({ ok: false }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, approval]);

  function appendAssistant(content: string, source?: string, trace?: string[], council?: CouncilMeta) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content, at: new Date().toISOString(), source, trace, council }]);
  }

  function speakText(text: string) {
    if (!speak || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[`*_#]/g, ""));
    utterance.lang = "ar-JO";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function toggleListening() {
    if (!speechSupported) return;
    if (listening && recognition.current) {
      recognition.current.stop();
      setListening(false);
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "ar-JO";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (event) => setInput(event.results?.[0]?.[0]?.transcript || "");
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || approvalBusy) return;
    const user: Message = { id: crypto.randomUUID(), role: "user", content: trimmed, at: new Date().toISOString() };
    const priorMessages = messages;
    setMessages((prev) => [...prev, user]);
    setInput("");
    setBusy(true);

    try {
      const history = priorMessages
        .filter((m) => m.id !== "intro")
        .slice(-12)
        .map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; source?: string; approval?: AgentApproval; trace?: string[]; council?: CouncilMeta };
      const reply = data.reply || `خطأ: ${data.error || "تعذر إكمال الطلب"}`;
      appendAssistant(reply, data.source, data.trace, data.council);
      if (data.approval) setApproval(data.approval);
      speakText(reply);
    } catch {
      appendAssistant("تعذر الوصول إلى ARCHEON Core API.", "error");
    } finally {
      setBusy(false);
    }
  }


  async function sendCouncilFeedback(messageId: string, sessionId: string, rating: "good" | "bad") {
    try {
      const res = await fetch("/api/council/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, rating }),
      });
      if (!res.ok) return;
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, feedback: rating } : m));
    } catch { /* feedback is optional */ }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    await sendText(input);
  }

  async function decideApproval(decision: "approve" | "reject") {
    if (!approval || approvalBusy) return;
    setApprovalBusy(true);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: approval.id, decision }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; source?: string };
      const reply = data.reply || `خطأ: ${data.error || "تعذر معالجة الموافقة"}`;
      appendAssistant(reply, data.source || "approval");
      speakText(reply);
    } catch {
      appendAssistant("تعذر الوصول إلى Approval Gateway.", "error");
    } finally {
      setApproval(null);
      setApprovalBusy(false);
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">ARCHEON</div>
        <div className="version">CORE / PERSONAL AGENT / v{status?.version || "0.5"}</div>

        <div className="section">
          <h3>النظام</h3>
          <div className="statusRow"><span>Core API</span><span className={`dot ${status?.ok ? "" : "off"}`} /></div>
          <div className="statusRow"><span>LLM</span><strong>{status?.model || status?.provider || "ADAPTIVE"}</strong></div>
          <div className="statusRow"><span>Routing</span><strong>{status?.routingMode || "..."}</strong></div>
          <div className="statusRow"><span>Fleet</span><strong>{status?.modelFleet?.routes || 0} ROUTES</strong></div>
          <div className="statusRow"><span>Reasoning</span><strong>{status?.reasoningEffort || "..."}</strong></div>
          <div className="statusRow"><span>Council</span><strong>{status?.council?.mode?.toUpperCase() || "..."}</strong></div>
          <div className="statusRow"><span>Council memory</span><strong>{status?.council?.sessions || 0}</strong></div>
          <div className="statusRow"><span>Learning</span><strong>{status?.learning?.enabled ? `${status.learning.count || 0} ITEMS` : "OFF"}</strong></div>
          <div className="statusRow"><span>Voice</span><strong>{speechSupported ? "READY" : "TEXT"}</strong></div>
          <div className="statusRow"><span>Agent steps</span><strong>{status?.maxAgentSteps || 5}</strong></div>
          <div className="statusRow"><span>Secret files</span><strong>{status?.secretFilesBlocked === false ? "UNLOCKED" : "BLOCKED"}</strong></div>
          <div className="statusRow"><span>OS Actions</span><strong>{status?.osActions ? "ARMED" : "OFF"}</strong></div>
          <div className="statusRow"><span>Device Mesh</span><strong>{status?.deviceMesh?.online || 0}/{status?.deviceMesh?.devices || 0} ONLINE</strong></div>
          <div className="statusRow"><span>Health Vault</span><strong>{status?.healthVault?.configured ? "AES-256-GCM" : "LOCKED"}</strong></div>
        </div>

        <div className="section">
          <h3>الموصلات</h3>
          <div className="statusRow"><span>GitHub</span><strong>{status?.connectors?.githubAuthenticated ? "TOKEN" : "PUBLIC"}</strong></div>
          <div className="statusRow"><span>Supabase</span><strong>{status?.connectors?.supabase ? "READY" : "OFF"}</strong></div>
          <div className="statusRow"><span>Workspace</span><strong>LOCAL</strong></div>
          <div className="statusRow"><span>Public APIs</span><strong>{status?.publicApis?.count || 0}</strong></div>
          <div className="statusRow"><span>API Skills</span><strong>{status?.publicApis?.skills || 0}</strong></div>
          <div className="statusRow"><span>Free LLMs</span><strong>{status?.freeLlms?.providers || 0} PROVIDERS</strong></div>
        </div>

        <div className="section">
          <h3>OMEGA Capabilities</h3>
          <div className="commands">/mesh<br />/devices<br />/pair Android-Phone<br />/permissions<br />/capabilities<br />/health heart_rate<br />/browser status<br />/council status</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><strong>PERSONAL COMMAND CENTER</strong><br /><small>Device Mesh • Cognitive Council • Permission Broker • privacy-gated</small></div>
          <button className="voiceToggle" onClick={() => setSpeak((v) => !v)}>الصوت: {speak ? "ON" : "OFF"}</button>
        </header>

        <section className="hero">
          <div className={`orbWrap ${busy ? "thinking" : listening ? "listening" : ""}`} aria-label="ARCHEON core visualizer">
            <div className="orbRing" /><div className="orbRing2" /><div className="orbCore" />
          </div>
          <h1>{busy ? "ARCHEON IS ANALYZING" : listening ? "LISTENING" : approval ? "AWAITING APPROVAL" : "ARCHEON ONLINE"}</h1>
          <p>{busy ? "Routing across the council, device mesh, BrowserSkill or local tools..." : approval ? "Review the proposed cross-device action before execution." : "RESEARCH + TRADING INTELLIGENCE + KNOWLEDGE FABRIC + DEVICE MESH ready"}</p>
        </section>

        <section className="quickBar" aria-label="Quick commands">
          {quickCommands.map((cmd) => <button key={cmd} onClick={() => sendText(cmd)} disabled={busy || approvalBusy}>{cmd}</button>)}
        </section>

        <section className="chat">
          <div className="messages">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="bubble">
                  {message.content}
                  {message.trace?.length ? <span className="trace">TOOLS: {message.trace.join(" → ")}</span> : null}
                  {message.council ? (
                    <div className="councilMeta">
                      COUNCIL {message.council.modelsAnswered}/{message.council.modelsAsked} • CONF {Math.round(message.council.confidence * 100)}% • CONSENSUS {Math.round(message.council.consensus * 100)}% • {message.council.rounds} ROUNDS
                      <div className="councilFeedback">
                        <button onClick={() => sendCouncilFeedback(message.id, message.council!.sessionId, "good")} disabled={Boolean(message.feedback)}>{message.feedback === "good" ? "✓ مفيد" : "👍 مفيد"}</button>
                        <button onClick={() => sendCouncilFeedback(message.id, message.council!.sessionId, "bad")} disabled={Boolean(message.feedback)}>{message.feedback === "bad" ? "✓ غير صحيح" : "👎 غير صحيح"}</button>
                      </div>
                    </div>
                  ) : null}
                  <span className="meta">{message.role === "assistant" ? `ARCHEON${message.source ? ` / ${message.source.toUpperCase()}` : ""}` : "YOU"}</span>
                </div>
              </div>
            ))}

            {approval && (
              <div className="approvalCard">
                <div className="approvalHead"><span>APPROVAL REQUIRED</span><strong>{approval.tool}</strong></div>
                <p>{approval.reason}</p>
                {approval.preview ? (
                  <>
                    <div className="previewLabel">DIFF / PREVIEW</div>
                    <pre className="diffPreview">{approval.preview}</pre>
                  </>
                ) : null}
                <details>
                  <summary>Arguments</summary>
                  <pre>{JSON.stringify(approval.argsPreview, null, 2)}</pre>
                </details>
                <small>تنتهي الموافقة: {new Date(approval.expiresAt).toLocaleTimeString("ar-JO")}</small>
                <div className="approvalActions">
                  <button className="rejectBtn" onClick={() => decideApproval("reject")} disabled={approvalBusy}>رفض</button>
                  <button className="approveBtn" onClick={() => decideApproval("approve")} disabled={approvalBusy}>{approvalBusy ? "..." : "موافقة وتنفيذ"}</button>
                </div>
              </div>
            )}

            {busy && <div className="message assistant"><div className="bubble">…<span className="meta">MULTI-STEP PROCESSING</span></div></div>}
            <div ref={bottomRef} />
          </div>
        </section>

        <div className="composerDock">
          <form className="composer" onSubmit={submit}>
            <button type="button" className={`iconBtn ${listening ? "active" : ""}`} onClick={toggleListening} disabled={!speechSupported || busy || approvalBusy} aria-label="Voice input">MIC</button>
            <input value={input} onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)} placeholder="اسأل أي سؤال؛ ARCHEON سيستشير النماذج والأدوات المتاحة ويقارن الأدلة قبل الرد..." disabled={busy || approvalBusy} />
            <button className="sendBtn" disabled={busy || approvalBusy || !input.trim()}>{busy ? "..." : "إرسال"}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
