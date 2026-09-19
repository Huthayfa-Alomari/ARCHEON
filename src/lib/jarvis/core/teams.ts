export type AgentRole={id:string;name:string;mission:string;defaultTools:string[];risk:"read"|"approval";};
export const AGENT_TEAM:AgentRole[]=[
{id:"architect",name:"Architect",mission:"Decompose systems and define interfaces, constraints and acceptance criteria.",defaultTools:["project.index","project.retrieve","knowledge.search"],risk:"read"},
{id:"researcher",name:"Researcher",mission:"Collect provenance-aware evidence and contradictions.",defaultTools:["research.swarm.run","knowledge.search","reach.web.read"],risk:"read"},
{id:"coder",name:"Coder",mission:"Implement bounded code changes after architecture review.",defaultTools:["workspace.read","workspace.search","workspace.patch","workspace.createFile"],risk:"approval"},
{id:"qa",name:"QA",mission:"Run checks, tests and regression evaluation.",defaultTools:["project.check","project.review","core.eval.run"],risk:"approval"},
{id:"security",name:"Security Reviewer",mission:"Review permissions, secrets, network and execution boundaries.",defaultTools:["project.review","core.sandbox.status","device.permission.list"],risk:"read"},
{id:"quant",name:"Quant Researcher",mission:"Design and falsify quantitative hypotheses with robust validation.",defaultTools:["research.factory.status","research.rank","core.quant.robustness"],risk:"read"},
{id:"biomed",name:"Biomedical Researcher",mission:"Produce evidence maps using PICO and primary literature.",defaultTools:["domain.biomed.pico","domain.pubmed.search"],risk:"read"},
{id:"engineer",name:"Engineering Analyst",mission:"Use deterministic engineering calculations and solver adapters.",defaultTools:["domain.engineering.calculate","domain.control.simulate"],risk:"read"}
];
export function teamPlan(args:{objective:string;roles?:string[]}){if(!args.objective?.trim())throw new Error("objective required");const selected=(args.roles?.length?AGENT_TEAM.filter(r=>args.roles!.includes(r.id)):AGENT_TEAM.slice(0,5));return{objective:args.objective,team:selected,handoffs:selected.map((r,i)=>({from:r.id,to:selected[i+1]?.id||"owner",deliverable:r.mission})),rule:"No agent inherits permissions from another agent; approval-gated tools remain approval-gated."};}
