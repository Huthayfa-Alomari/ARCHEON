import type { ToolCall,ToolExecutionResult } from "../types";
import { createMission,listMissions,missionStatus,updateMissionTask } from "./missions";
import { remember2,searchMemory2,consolidateMemory2 } from "./memory2";
import { teamPlan,AGENT_TEAM } from "./teams";
import { runCoreEvals } from "./evals";
import { sandboxStatus,sandboxRun } from "./sandbox";
import { listPlugins,registerPlugin,setPluginEnabled } from "./plugins";
import { proposeImprovement } from "./self-improvement";
import { quantRobustness } from "./quant-robustness";
const ok=(tool:string,data:unknown):ToolExecutionResult=>({ok:true,tool,summary:JSON.stringify(data,null,2),data});
export async function executeCoreTool(call:ToolCall):Promise<ToolExecutionResult>{
 const a=call.args as any;
 switch(call.tool){
 case"core.mission.create":return ok(call.tool,await createMission(a));
 case"core.mission.list":return ok(call.tool,await listMissions(Number(a.limit||50)));
 case"core.mission.status":return ok(call.tool,await missionStatus(String(a.id||"")));
 case"core.mission.task.update":return ok(call.tool,await updateMissionTask(a));
 case"core.memory.remember":return ok(call.tool,await remember2(a));
 case"core.memory.search":return ok(call.tool,await searchMemory2(String(a.query||""),Number(a.limit||12),a.kinds));
 case"core.memory.consolidate":return ok(call.tool,await consolidateMemory2());
 case"core.team.catalog":return ok(call.tool,AGENT_TEAM);
 case"core.team.plan":return ok(call.tool,teamPlan(a));
 case"core.eval.run":return ok(call.tool,await runCoreEvals());
 case"core.sandbox.status":return ok(call.tool,await sandboxStatus());
 case"core.sandbox.run":return ok(call.tool,await sandboxRun(a));
 case"core.plugins.list":return ok(call.tool,await listPlugins());
 case"core.plugins.register":return ok(call.tool,await registerPlugin(a));
 case"core.plugins.enable":return ok(call.tool,await setPluginEnabled(String(a.id||""),Boolean(a.enabled)));
 case"core.selfImprove.propose":return ok(call.tool,proposeImprovement(a));
 case"core.quant.robustness":return ok(call.tool,quantRobustness(a));
 default:return{ok:false,tool:call.tool,summary:"Core v1.4 tool not implemented.",error:"not implemented"};
 }}
