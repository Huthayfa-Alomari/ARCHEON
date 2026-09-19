import fs from "node:fs/promises";import path from "node:path";
type SecurityState={lockdown:boolean;reason?:string;updatedAt:string};const p=()=>path.resolve(process.env.JARVIS_SECURITY_STATE_PATH||"./data/security-state.json");
export async function securityState():Promise<SecurityState>{try{return JSON.parse(await fs.readFile(p(),"utf8"))}catch{return{lockdown:false,updatedAt:new Date(0).toISOString()}}}
export async function setLockdown(lockdown:boolean,reason?:string){const s={lockdown,reason:reason?.slice(0,500),updatedAt:new Date().toISOString()};await fs.mkdir(path.dirname(p()),{recursive:true});await fs.writeFile(p(),JSON.stringify(s,null,2),"utf8");return s;}
