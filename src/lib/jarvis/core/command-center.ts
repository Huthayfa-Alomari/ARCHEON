import { listMissions } from "./missions";
import { listPlugins } from "./plugins";
import { sandboxStatus } from "./sandbox";
import { AGENT_TEAM } from "./teams";
import { deviceMeshStatus } from "../device-mesh";
import { factoryStatus } from "../research/factory";
import { listPendingApprovals } from "../approvals";
export async function commandCenterStatus(){const [missions,plugins,sandbox,mesh,factory,approvals]=await Promise.all([listMissions(200),listPlugins(),sandboxStatus(),deviceMeshStatus(),factoryStatus(),listPendingApprovals()]);return{version:"1.4",missions:{total:missions.length,active:missions.filter(x=>x.status==="active").length,completed:missions.filter(x=>x.status==="completed").length},agents:{roles:AGENT_TEAM.length},plugins:{total:plugins.length,enabled:plugins.filter(x=>x.enabled).length},sandbox,deviceMesh:mesh,researchFactory:factory.byStatus,approvals:{pending:approvals.length,items:approvals.map(x=>({id:x.id,tool:x.toolCall.tool,createdAt:x.createdAt,expiresAt:x.expiresAt,reason:x.toolCall.reason}))},updatedAt:new Date().toISOString()};}
