import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolCall, ToolExecutionResult } from "../types";
import { safeFetchText } from "../safe-net";
import { jarvisConfig } from "../config";
import { reachDoctor, agentReachDoctor } from "./doctor";
import { channelByName } from "./channels";
const execFileAsync = promisify(execFile);

function s(v:unknown){return typeof v === "string"?v:"";}
function n(v:unknown,d=5){const x=Number(v);return Number.isFinite(x)?Math.max(1,Math.min(30,Math.trunc(x))):d;}
function ok(tool:string,summary:string,data?:unknown):ToolExecutionResult{return {ok:true,tool,summary,data};}
function fail(tool:string,e:unknown):ToolExecutionResult{const m=e instanceof Error?e.message:String(e);return {ok:false,tool,summary:m,error:m};}
function httpsUrl(raw:string){const u=new URL(raw);if(u.protocol!=="https:")throw new Error("Only HTTPS URLs are allowed.");return u.toString();}
async function run(command:string,args:string[],timeout=30_000,env?:Record<string,string|undefined>){
 const {stdout,stderr}=await execFileAsync(command,args,{timeout,windowsHide:true,maxBuffer:4_000_000,env:env?{...process.env,...env}:process.env});
 return (stdout||stderr||"").trim();
}

async function webRead(call:ToolCall){
 const url=httpsUrl(s(call.args.url));
 try { const r=await safeFetchText(`https://r.jina.ai/${url}`,{maxBytes:900_000}); return ok(call.tool,r.text.slice(0,120_000),{url,backend:"jina-reader",resolved:r.url,bytes:r.text.length}); }
 catch { const r=await safeFetchText(url,{maxBytes:900_000}); return ok(call.tool,r.text.slice(0,120_000),{url,backend:"native-fetch",resolved:r.url,bytes:r.text.length}); }
}
async function exaSearch(call:ToolCall){const q=s(call.args.query).trim();if(!q)throw new Error("query required");const limit=n(call.args.limit,5);const raw=await run("mcporter",["call","exa.web_search_exa",`query=${q}`,`numResults=${limit}`],45_000);return ok(call.tool,raw.slice(0,120_000));}
async function githubSearch(call:ToolCall){const q=s(call.args.query).trim();if(!q)throw new Error("query required");const raw=await run("gh",["search","repos",q,"--sort","stars","--limit",String(n(call.args.limit,10)),"--json","nameWithOwner,description,url,stargazerCount,updatedAt"],30_000);return ok(call.tool,raw.slice(0,120_000));}
async function rssRead(call:ToolCall){const url=httpsUrl(s(call.args.url));const response=await safeFetchText(url,{maxBytes:900_000});const raw=response.text;const titles=[...raw.matchAll(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi)].slice(0,n(call.args.limit,15)).map(m=>m[1].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim());return ok(call.tool,titles.map((t,i)=>`${i+1}. ${t}`).join("\n")||"No feed titles parsed.",{url,titles});}
async function youtubeTranscript(call:ToolCall){const url=httpsUrl(s(call.args.url));const dir=await fs.mkdtemp(path.join(os.tmpdir(),"jarvis-yt-"));try{await run("yt-dlp",["--write-sub","--write-auto-sub","--skip-download","--sub-langs",s(call.args.lang)||"en.*,ar.*","--sub-format","vtt","-o",path.join(dir,"%(id)s.%(ext)s"),url],90_000);const files=(await fs.readdir(dir)).filter((f:string)=>f.endsWith(".vtt"));if(!files.length)throw new Error("No subtitles found.");const text=await fs.readFile(path.join(dir,files[0]),"utf8");const cleaned=text.replace(/^WEBVTT[\s\S]*?\n\n/,"").replace(/\d\d:\d\d:[\d.]+ --> .*$/gm,"").replace(/<[^>]+>/g,"").split(/\r?\n/).filter((x:string,i:number,a:string[])=>x.trim()&&x!==a[i-1]).join("\n");return ok(call.tool,cleaned.slice(0,120_000),{url,file:files[0]});}finally{await fs.rm(dir,{recursive:true,force:true});}}
async function socialSearch(call:ToolCall){const platform=s(call.args.platform).toLowerCase();const q=s(call.args.query).trim();if(!q)throw new Error("query required");const channel=channelByName(platform);if(!channel)throw new Error("Unsupported platform.");let raw="";if(platform==="twitter") raw=await run("twitter",["search",q,"-n",String(n(call.args.limit,10))],30_000);else if(platform==="reddit") {try{raw=await run("opencli",["reddit","search",q,"-f","yaml"],45_000);}catch{raw=await run("rdt",["search",q,"--limit",String(n(call.args.limit,10))],30_000);}}else if(["facebook","instagram","xiaohongshu"].includes(platform)) raw=await run("opencli",[platform,"search",q,"-f","yaml"],45_000);else if(platform==="bilibili") raw=await run("bili",["search",q,"--type","video","-n",String(n(call.args.limit,5))],30_000);else throw new Error("Use a dedicated Reach tool for this channel.");return ok(call.tool,raw.slice(0,120_000),{platform});}

async function routeInfo(call:ToolCall){
 const raw=s(call.args.url); if(!raw) throw new Error("url required"); const u=new URL(raw); const host=u.hostname.toLowerCase();
 const { REACH_CHANNELS } = await import("./channels");
 const channel=REACH_CHANNELS.find(c=>(c.hosts||[]).some(h=>host===h||host.endsWith(`.${h}`))) || channelByName("web");
 return ok(call.tool,`${channel?.name||"web"} → ${(channel?.backends||[]).map(b=>b.id).join(" > ")}`,channel);
}
async function careerSearch(call:ToolCall){
 const platform=s(call.args.platform).toLowerCase(); const q=s(call.args.query).trim(); if(!q) throw new Error("query required");
 const location=s(call.args.location).trim();
 if(platform==="linkedin") { const args=["call","linkedin.search_jobs",`keywords=${q}`]; if(location) args.push(`location=${location}`); args.push(`max_pages=${Math.min(3,n(call.args.pages,1))}`); const raw=await run("mcporter",args,60_000); return ok(call.tool,raw.slice(0,120_000),{platform}); }
 if(platform==="boss") { const args=["--browser-source","existing-browser","--cdp-url",jarvisConfig.bossCdpUrl,"search",q]; if(location) args.push("--city",location); args.push("--page",String(n(call.args.page,1))); const raw=await run("boss",args,60_000); return ok(call.tool,raw.slice(0,120_000),{platform,cdp:"loopback-only recommended"}); }
 throw new Error("platform must be linkedin or boss");
}

async function installAgentReach(call:ToolCall){const mode=s(call.args.mode)||"safe";await run(jarvisConfig.pythonBin,["-m","pip","install","--upgrade","https://github.com/Panniantong/Agent-Reach/archive/main.zip"],120_000);if(mode==="system") await run(jarvisConfig.agentReachBin,["install","--env=auto","--system"],120_000);const d=await agentReachDoctor();return ok(call.tool,"Agent-Reach installed/updated. Doctor executed.",d);}

export async function executeReachTool(call:ToolCall):Promise<ToolExecutionResult>{try{
 switch(call.tool){
  case "reach.doctor":{const data=await reachDoctor();return ok(call.tool,data.map(x=>`${x.status.toUpperCase()} ${x.channel} → ${x.activeBackend||"none"}`).join("\n"),data);}
  case "reach.route":return await routeInfo(call);
  case "reach.agentReach.doctor":{const data=await agentReachDoctor();return ok(call.tool,JSON.stringify(data,null,2).slice(0,120_000),data);}
  case "reach.web.read":return await webRead(call);
  case "reach.search.exa":return await exaSearch(call);
  case "reach.github.search":return await githubSearch(call);
  case "reach.rss.read":return await rssRead(call);
  case "reach.youtube.transcript":return await youtubeTranscript(call);
  case "reach.social.search":return await socialSearch(call);
  case "reach.career.search":return await careerSearch(call);
  case "reach.install":return await installAgentReach(call);
  default:return fail(call.tool,"Unknown Reach tool");
 }
}catch(e){return fail(call.tool,e);}}
