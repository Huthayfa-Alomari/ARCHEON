import { listMissions } from "../core/missions";
import { consolidateMemory2,searchMemory2 } from "../core/memory2";
import { factoryStatus } from "../research/factory";
import { searchClaims } from "../research/claim-graph";
import { listBeliefs } from "./beliefs";
import { enqueueThought } from "./queue";

export async function curiosityScan(){
 const created=[];const beliefs=await listBeliefs(200);
 for(const b of beliefs.filter(x=>x.status==="contested"||x.confidence<.45).slice(0,8))created.push(await enqueueThought({kind:"question",title:`Resolve belief uncertainty: ${b.statement.slice(0,120)}`,reason:`Belief status=${b.status}, confidence=${b.confidence.toFixed(2)}, support=${b.support.length}, against=${b.against.length}`,importance:.7,expectedValue:.75,confidence:.7,risk:.1,sourceRefs:[...b.support,...b.against]}));
 const contested=await searchClaims("",50).catch(()=>[]);
 for(const c of contested.filter((x:any)=>x.status==="contested").slice(0,5))created.push(await enqueueThought({kind:"research",title:`Investigate contested claim: ${c.text.slice(0,120)}`,reason:"Claim Graph contains contradictory evidence.",importance:.75,expectedValue:.8,confidence:.7,risk:.1,sourceRefs:c.sourceRefs||[]}));
 return created;
}
export async function reflectionScan(){
 const created=[];const f=await factoryStatus();for(const j of f.recent.filter((x:any)=>x.status==="failed").slice(0,6))created.push(await enqueueThought({kind:"reflection",title:`Analyze failed research job ${j.id}`,reason:String(j.error||"Research Factory job failed."),importance:.65,urgency:.5,expectedValue:.65,confidence:.9,risk:.05,sourceRefs:[j.id]}));
 const failures=await searchMemory2("failure",20,["failure"]).catch(()=>[]);
 for(const m of failures.slice(0,5))created.push(await enqueueThought({kind:"reflection",title:`Prevent repeated failure: ${m.content.slice(0,100)}`,reason:"Failure Memory indicates a recurring learning opportunity.",importance:.6,expectedValue:.7,confidence:.75,risk:.05,sourceRefs:[m.id]}));
 return created;
}
export async function goalScan(){
 const created=[];const missions=await listMissions(100);
 for(const m of missions.filter(x=>x.status==="active")){const ready=m.tasks.filter(t=>t.status==="todo"&&t.dependsOn.every(d=>m.tasks.find(x=>x.id===d)?.status==="done"));if(ready.length===0&&m.tasks.some(t=>t.status!=="done"))created.push(await enqueueThought({kind:"goal",title:`Unblock mission: ${m.title}`,reason:"Active mission has no dependency-ready task.",importance:.8,urgency:.6,expectedValue:.75,confidence:.9,risk:.15,missionId:m.id}));}
 return created;
}
export async function maintenanceScan(){const c=await consolidateMemory2();if(c.consolidationCandidates.length)return[await enqueueThought({kind:"maintenance",title:"Review Memory 2.0 consolidation candidates",reason:`${c.consolidationCandidates.length} memory groups may benefit from consolidation.`,importance:.4,expectedValue:.45,confidence:.9,risk:.05})];return[]}
