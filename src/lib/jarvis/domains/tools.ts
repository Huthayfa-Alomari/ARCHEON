import type { ToolCall, ToolExecutionResult } from "../types";
import { pubmedSearch } from "./pubmed";
import { biomedicalEvidenceBrief } from "./biomed";
import { engineeringCalculate } from "./engineering";
import { picoEvidenceTable } from "./pico";
import { engineeringAdaptersDoctor, runSpice, runFea, runCfd, runMesh, simulateControl } from "./engineering-adapters";
export async function executeDomainTool(call:ToolCall):Promise<ToolExecutionResult>{try{
 if(call.tool==="domain.pubmed.search"){const rows=await pubmedSearch(String(call.args.query||""),Number(call.args.limit||10));return {ok:true,tool:call.tool,summary:`PubMed returned ${rows.length} biomedical citations.`,data:rows};}
 if(call.tool==="domain.biomed.evidenceBrief"){const r=await biomedicalEvidenceBrief(String(call.args.query||""),Number(call.args.limit||12));return {ok:true,tool:call.tool,summary:`Biomedical evidence brief: ${r.count} PubMed citations; research-only, no autonomous clinical action.`,data:r};}
 if(call.tool==="domain.biomed.pico"){const r=await picoEvidenceTable(call.args as any);return {ok:true,tool:call.tool,summary:`PICO evidence table built with ${r.evidenceTable.length} PubMed records; article-level appraisal still required.`,data:r};}
 if(call.tool==="domain.engineering.adapters.doctor"){const r=await engineeringAdaptersDoctor();return {ok:true,tool:call.tool,summary:`Engineering adapters probed: ${r.adapters.filter(x=>x.available).length}/${r.adapters.length} available.`,data:r};}
 if(call.tool==="domain.spice.run"){const r=await runSpice(call.args as any);return {ok:r.code===0,tool:call.tool,summary:`ngspice exited ${r.code}; output ${r.outputPath}.`,data:r};}
 if(call.tool==="domain.fea.run"){const r=await runFea(call.args as any);return {ok:r.code===0,tool:call.tool,summary:`CalculiX job ${r.job} exited ${r.code}.`,data:r};}
 if(call.tool==="domain.cfd.run"){const r=await runCfd(call.args as any);return {ok:r.code===0,tool:call.tool,summary:`OpenFOAM ${r.solver} exited ${r.code}.`,data:r};}
 if(call.tool==="domain.mesh.run"){const r=await runMesh(call.args as any);return {ok:r.code===0,tool:call.tool,summary:`Gmsh ${r.dimension}D meshing exited ${r.code}; output ${r.outputPath}.`,data:r};}
 if(call.tool==="domain.control.simulate"){const r=simulateControl(call.args as any);return {ok:true,tool:call.tool,summary:`Control-system simulation completed: ${r.steps} steps, ${r.samples.length} retained samples.`,data:r};}
 if(call.tool==="domain.engineering.calculate"){const kind=String(call.args.kind||"") as any;const r=engineeringCalculate(kind,call.args);return {ok:true,tool:call.tool,summary:`Engineering calculation ${kind} completed with explicit equation/assumptions.`,data:r};}
 return {ok:false,tool:call.tool,summary:"Unknown domain tool."};
}catch(e){return {ok:false,tool:call.tool,summary:`Domain tool failed: ${e instanceof Error?e.message:"unknown"}`,error:e instanceof Error?e.message:"unknown"};}}
