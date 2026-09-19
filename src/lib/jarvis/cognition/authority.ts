import fs from "node:fs/promises";
import path from "node:path";

export type AutonomyLevel=0|1|2|3|4;
export type AuthorityState={enabled:boolean;level:AutonomyLevel;maxActionsPerCycle:number;maxResearchJobsPerCycle:number;allowInternalWrites:boolean;allowReadTools:boolean;allowResearchQueue:boolean;updatedAt:string};

const file=()=>path.resolve(process.env.JARVIS_AUTONOMY_PATH||"./data/autonomy.json");
const DEFAULT:AuthorityState={enabled:false,level:2,maxActionsPerCycle:8,maxResearchJobsPerCycle:2,allowInternalWrites:true,allowReadTools:true,allowResearchQueue:true,updatedAt:new Date(0).toISOString()};

export async function authorityState():Promise<AuthorityState>{try{return{...DEFAULT,...JSON.parse(await fs.readFile(file(),"utf8"))}}catch{return DEFAULT}}
export async function setAuthority(args:Partial<AuthorityState>){
  const prev=await authorityState();
  const level=Math.max(0,Math.min(4,Number(args.level??prev.level))) as AutonomyLevel;
  const next:AuthorityState={...prev,...args,level,maxActionsPerCycle:Math.max(1,Math.min(Number(args.maxActionsPerCycle??prev.maxActionsPerCycle),50)),maxResearchJobsPerCycle:Math.max(0,Math.min(Number(args.maxResearchJobsPerCycle??prev.maxResearchJobsPerCycle),10)),updatedAt:new Date().toISOString()};
  await fs.mkdir(path.dirname(file()),{recursive:true});await fs.writeFile(file(),JSON.stringify(next,null,2),"utf8");return next;
}
export function authorityPolicy(level:AutonomyLevel){
  return {
    level,
    description:[
      "Reactive only",
      "Reflection and memory only",
      "Proactive planning and internal queue",
      "Autonomous read/research operations",
      "Bounded operational automation for pre-authorized low-risk actions"
    ][level],
    neverSelfAuthorize:["approval-gated tools","live trading","permission grants","secret access","production writes","medical treatment","self-merge"]
  };
}
