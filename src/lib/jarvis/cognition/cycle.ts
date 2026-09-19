import fs from "node:fs/promises";import path from "node:path";
import { authorityPolicy,authorityState } from "./authority";
import { curiosityScan,reflectionScan,goalScan,maintenanceScan } from "./engines";
import { listThoughts,resolveThought } from "./queue";
import { securityState } from "../core/security-state";
import { enqueueFactoryJob } from "../research/factory";

type CycleRecord={at:string;generated:number;considered:number;resolved:number;blocked:number;notes:string[]};
const p=()=>path.resolve(process.env.JARVIS_COGNITION_HISTORY_PATH||"./data/cognition-history.json");
async function history():Promise<CycleRecord[]>{try{return JSON.parse(await fs.readFile(p(),"utf8"))}catch{return[]}}async function saveHistory(x:CycleRecord[]){await fs.mkdir(path.dirname(p()),{recursive:true});await fs.writeFile(p(),JSON.stringify(x.slice(-2000),null,2),"utf8")}

export async function runCognitionCycle(args:{idle?:boolean}={}){
 const authority=await authorityState(),security=await securityState();if(!authority.enabled)return{ran:false,reason:"Autonomy is disabled.",authority,policy:authorityPolicy(authority.level)};if(security.lockdown)return{ran:false,reason:"Global lockdown is active.",authority};
 const generated=[...(await curiosityScan()),...(await reflectionScan()),...(await goalScan()),...(args.idle?await maintenanceScan():[])];
 const queue=await listThoughts(authority.maxActionsPerCycle,"queued");let resolved=0,blocked=0,researchJobs=0;const notes:string[]=[];
 for(const t of queue){
   if(t.risk>.35&&authority.level<4){await resolveThought(t.id,"blocked","Risk exceeds current autonomy level.");blocked++;continue}
   if(t.kind==="research"&&authority.level>=3&&authority.allowResearchQueue&&researchJobs<authority.maxResearchJobsPerCycle){
     await enqueueFactoryJob("portfolio",{minCoverage:1,minPassRate:.6,challengers:8});researchJobs++;await resolveThought(t.id,"resolved","Queued a bounded research portfolio review job.");resolved++;notes.push(`${t.id}: queued bounded research review`);continue;
   }
   if(["reflection","question","goal","maintenance","hypothesis"].includes(t.kind)){await resolveThought(t.id,"resolved","Reviewed and retained for operator/model follow-up; no external authority used.");resolved++;continue}
   blocked++;
 }
 const rec:CycleRecord={at:new Date().toISOString(),generated:generated.length,considered:queue.length,resolved,blocked,notes};const h=await history();h.push(rec);await saveHistory(h);return{ran:true,authority,generated:generated.length,considered:queue.length,resolved,blocked,researchJobs,notes,topQueue:await listThoughts(20,"queued")};
}
export async function cognitionHistory(limit=50){return(await history()).slice(-Math.max(1,Math.min(limit,500))).reverse()}
