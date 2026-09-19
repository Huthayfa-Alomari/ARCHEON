import { authorityState } from "../src/lib/jarvis/cognition/authority";
import { runCognitionCycle } from "../src/lib/jarvis/cognition/cycle";

const intervalSeconds=Math.max(60,Math.min(Number(process.env.JARVIS_COGNITION_INTERVAL_SECONDS||300),86400));
const idleEvery=Math.max(1,Math.min(Number(process.env.JARVIS_COGNITION_IDLE_EVERY||12),1000));
let cycle=0,running=false;

async function tick(){
  if(running)return;
  running=true;
  try{
    const authority=await authorityState();
    if(!authority.enabled){
      process.stdout.write(`[${new Date().toISOString()}] autonomy disabled\n`);
      return;
    }
    cycle++;
    const result=await runCognitionCycle({idle:cycle%idleEvery===0});
    process.stdout.write(`[${new Date().toISOString()}] cognition ${JSON.stringify({ran:result.ran,generated:"generated" in result?result.generated:0,resolved:"resolved" in result?result.resolved:0,blocked:"blocked" in result?result.blocked:0})}\n`);
  }catch(error){
    process.stderr.write(`[${new Date().toISOString()}] cognition error: ${error instanceof Error?error.message:"unknown"}\n`);
  }finally{running=false;}
}

process.stdout.write(`ARCHEON cognition worker online; interval=${intervalSeconds}s idleEvery=${idleEvery} cycles\n`);
void tick();
setInterval(()=>void tick(),intervalSeconds*1000);
