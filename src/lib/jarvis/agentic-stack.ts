import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync=promisify(execFile);
export type AgenticStackItem={id:string;repo:string;role:string;pattern:string;integration:"native-pattern"|"optional-adapter"|"reference-only";licenseNote:string;};
export const AGENTIC_STACK:AgenticStackItem[]=[
{id:"ecc",repo:"affaan-m/ECC",role:"agent harness",pattern:"skills/rules/hooks/memory/security/research discipline",integration:"native-pattern",licenseNote:"Pattern only; do not vendor without separate license review."},
{id:"hermes",repo:"NousResearch/hermes-agent",role:"cross-context personal agent",pattern:"CLI + messaging gateways + memory + tools + MCP",integration:"native-pattern",licenseNote:"Pattern only."},
{id:"firecrawl",repo:"firecrawl/firecrawl",role:"live web grounding",pattern:"crawl/search/extract into agent-ready structured context",integration:"optional-adapter",licenseNote:"Optional external service/self-host adapter; existing Reach remains fallback."},
{id:"gemini-cli",repo:"google-gemini/gemini-cli",role:"terminal agent",pattern:"reason-act terminal workflow + MCP",integration:"reference-only",licenseNote:"Use as external model/tool route rather than embedding."},
{id:"browser-use",repo:"browser-use/browser-use",role:"browser automation",pattern:"browser state/action loop for sites without APIs",integration:"optional-adapter",licenseNote:"Optional adapter; BrowserSkill remains preferred when installed."},
{id:"daytona",repo:"daytonaio/daytona",role:"sandbox execution",pattern:"isolated filesystem/network/resources for generated code",integration:"native-pattern",licenseNote:"Repository/product lifecycle must be verified before external dependency."},
{id:"deerflow",repo:"bytedance/deer-flow",role:"long-horizon orchestration",pattern:"subagents + memory + sandbox + skills + recovery",integration:"native-pattern",licenseNote:"Pattern only."},
{id:"openai-agents",repo:"openai/openai-agents-python",role:"multi-agent runtime",pattern:"handoffs + guardrails + sessions + tracing",integration:"native-pattern",licenseNote:"Native JARVIS concepts mirror the pattern; optional Python adapter can be added separately."},
{id:"500-agents",repo:"ashishpatel26/500-AI-Agents-Projects",role:"use-case catalog",pattern:"cross-industry workflow discovery",integration:"reference-only",licenseNote:"Use as discovery index; verify every linked project independently."},
];
async function probe(bin:string,args:string[]=["--version"]){try{const r=await execFileAsync(bin,args,{timeout:5000});return{available:true,detail:(r.stdout||r.stderr||"").trim().slice(0,300)};}catch{return{available:false,detail:"not detected"};}}
export async function agenticStackStatus(){const [docker,gemini]=await Promise.all([probe(process.platform==="win32"?"docker.exe":"docker"),probe(process.platform==="win32"?"gemini.cmd":"gemini")]);return{generatedAt:new Date().toISOString(),principles:{guardrails:true,localTracing:true,approvalGateway:true,reachFallbacks:true,subagentCouncil:true,sandboxPolicy:"allow-listed adapters only; no unrestricted shell exposed to the model"},optionalRuntimes:{docker,gemini},items:AGENTIC_STACK};}
