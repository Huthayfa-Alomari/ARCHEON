import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const exec=promisify(execFile);
export async function sandboxStatus(){try{const {stdout}=await exec("docker",["version","--format","{{.Server.Version}}"],{timeout:8000,windowsHide:true});return{available:true,runtime:"docker",version:stdout.trim()};}catch(e){return{available:false,runtime:"docker",error:e instanceof Error?e.message:"unavailable"};}}
export async function sandboxRun(args:{language:"python"|"node";code:string;timeoutSeconds?:number}){if(!args.code?.trim())throw new Error("code required");if(Buffer.byteLength(args.code,"utf8")>100_000)throw new Error("code too large");const status=await sandboxStatus();if(!status.available)throw new Error("Docker sandbox is not available.");const dir=await fs.mkdtemp(path.join(os.tmpdir(),"archeon-sbx-"));const ext=args.language==="python"?"py":"js",file=path.join(dir,`main.${ext}`);await fs.writeFile(file,args.code,"utf8");const image=args.language==="python"?"python:3.13-alpine":"node:22-alpine";const cmd=args.language==="python"?["python","/work/main.py"]:["node","/work/main.js"];try{const {stdout,stderr}=await exec("docker",["run","--rm","--network","none","--memory","256m","--cpus","1","--pids-limit","64","--read-only","-v",`${dir}:/work:ro`,image,...cmd],{timeout:Math.max(1,Math.min(args.timeoutSeconds||20,60))*1000,maxBuffer:1024*1024,windowsHide:true});return{ok:true,stdout,stderr};}finally{await fs.rm(dir,{recursive:true,force:true});}}
