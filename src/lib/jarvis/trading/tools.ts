import type { ToolCall, ToolExecutionResult } from "../types";
import { armTrading, disarmTrading, tradingPermit } from "./state";
import { mt5Bars, mt5Order, mt5Positions, mt5Status } from "./mt5";
import { autopilotStep } from "./autopilot";
import { detectIctSmc, ictSmcSignal } from "./ict-smc";
export async function executeTradingTool(call:ToolCall):Promise<ToolExecutionResult>{try{
  if(call.tool==="trading.mt5.status")return {ok:true,tool:call.tool,summary:"MT5 connection status loaded.",data:await mt5Status()};
  if(call.tool==="trading.mt5.positions")return {ok:true,tool:call.tool,summary:"MT5 positions loaded.",data:await mt5Positions()};
  if(call.tool==="trading.mt5.bars")return {ok:true,tool:call.tool,summary:"MT5 market bars loaded.",data:await mt5Bars(String(call.args.symbol),String(call.args.timeframe||"M15"),Number(call.args.count||500))};
  if(call.tool==="trading.ictsmc.detect"){
    const symbol=String(call.args.symbol||"XAUUSD"), timeframe=String(call.args.timeframe||"M15"), count=Math.max(80,Math.min(Number(call.args.count||500),5000));
    const raw=await mt5Bars(symbol,timeframe,count) as any;
    const bars=(raw.bars||raw.data||[]).map((b:any)=>({time:b.time,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)})).filter((b:any)=>[b.open,b.high,b.low,b.close].every(Number.isFinite));
    const strategy={kind:"ict-smc" as const,timeframe,params:{swingWindow:Number(call.args.swingWindow||3),liquidityLookback:Number(call.args.liquidityLookback||20),equalToleranceAtr:Number(call.args.equalToleranceAtr||0.12),displacementAtr:Number(call.args.displacementAtr||1.2),confirmBars:Number(call.args.confirmBars||4),minScore:Number(call.args.minScore||1.4)},direction:"both" as const};
    const detected=detectIctSmc(bars,strategy), signal=ictSmcSignal(strategy,bars);
    return {ok:true,tool:call.tool,summary:`ICT/SMC ${symbol} ${timeframe}: structure=${detected.structure}, signal=${signal.signal}, score=${signal.score}, ${detected.features.length} features.`,data:{symbol,timeframe,bars:bars.length,structure:detected.structure,signal,features:detected.features.slice(-250),swingHighs:detected.swingHighs.slice(-50),swingLows:detected.swingLows.slice(-50)}};
  }
  if(call.tool==="trading.autopilot.status"){const p=await tradingPermit("paper");return {ok:true,tool:call.tool,summary:`Trading mode=${p.state.mode}, armedUntil=${p.state.armedUntil||"-"}.`,data:p.state};}
  if(call.tool==="trading.autopilot.arm"){const mode=String(call.args.mode)==="live"?"live":"paper";const s=await armTrading(mode,Number(call.args.minutes||60));return {ok:true,tool:call.tool,summary:`Trading ${mode} armed until ${s.armedUntil}.`,data:s};}
  if(call.tool==="trading.autopilot.disarm"){const s=await disarmTrading();return {ok:true,tool:call.tool,summary:"Trading autopilot disarmed.",data:s};}
  if(call.tool==="trading.autopilot.step"){const r=await autopilotStep(call.args as any);return {ok:true,tool:call.tool,summary:r.executed?`Autopilot executed ${r.mode} ${r.side}.`:`Autopilot ${r.mode}: ${r.signal.reason}; no live order sent.`,data:r};}
  if(call.tool==="trading.mt5.order"){const r=await mt5Order(call.args as any);return {ok:true,tool:call.tool,summary:`MT5 ${String(call.args.mode)} ${String(call.args.side)} request completed for ${String(call.args.symbol)}.`,data:r};}
  return {ok:false,tool:call.tool,summary:"Unknown trading tool."};
}catch(e){return {ok:false,tool:call.tool,summary:`Trading tool failed: ${e instanceof Error?e.message:"unknown"}`,error:e instanceof Error?e.message:"unknown"};}}
