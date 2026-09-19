import { NextResponse } from "next/server";
import { telegramAuthorized, telegramSend } from "@/lib/jarvis/telegram";
import { audit } from "@/lib/jarvis/audit";
import { mt5Order, mt5Positions, mt5Status } from "@/lib/jarvis/trading/mt5";
import { disarmTrading, tradingPermit } from "@/lib/jarvis/trading/state";
export const runtime="nodejs";

async function reply(chatId:string,text:string){ await telegramSend(text,chatId); }
export async function POST(req:Request){
  const secret=req.headers.get("x-telegram-bot-api-secret-token")||""; const u=await req.json() as any; const msg=u?.message||u?.edited_message; const chatId=String(msg?.chat?.id||""); const text=String(msg?.text||"").trim();
  if(!chatId||!text)return NextResponse.json({ok:true,ignored:true}); if(!telegramAuthorized(chatId,secret))return NextResponse.json({ok:false},{status:403});
  await audit({event:"telegram.inbound",ok:true,detail:`chat=${chatId} text=${text.slice(0,120)}`});
  try{
    if(text==="/ping"){await reply(chatId,"ARCHEON v1.3 online.");return NextResponse.json({ok:true});}
    if(/^\/mt5\s+status$/i.test(text)){const s=await mt5Status();await reply(chatId,`MT5 connected. Account=${s.account?.login ?? "?"} Equity=${s.account?.equity ?? "?"}`);return NextResponse.json({ok:true});}
    if(/^\/positions$/i.test(text)){const p=await mt5Positions();const rows=(p.positions||[]).slice(0,20).map((x:any)=>`${x.symbol} ${x.type===0?"BUY":"SELL"} ${x.volume} P/L=${x.profit}`);await reply(chatId,rows.length?rows.join("\n"):"No open MT5 positions.");return NextResponse.json({ok:true});}
    if(/^\/kill$/i.test(text)){await disarmTrading();await reply(chatId,"Trading permit revoked. Kill switch active.");return NextResponse.json({ok:true});}
    const m=text.match(/^\/(buy|sell)\s+(\S+)\s+([0-9.]+)\s+sl=([0-9.]+)(?:\s+tp=([0-9.]+))?$/i);
    if(m){const permit=await tradingPermit("live");if(!permit.allowed){await reply(chatId,"Live trading is not armed. Arm it from the ARCHEON console first.");return NextResponse.json({ok:true});}const r=await mt5Order({mode:"live",side:m[1].toLowerCase() as "buy"|"sell",symbol:m[2].toUpperCase(),volume:Number(m[3]),sl:Number(m[4]),tp:m[5]?Number(m[5]):undefined,comment:"ARCHEON-TG"});await reply(chatId,`Order submitted: ${m[1].toUpperCase()} ${m[2].toUpperCase()} ${m[3]}. retcode=${r.result?.retcode ?? "?"}`);return NextResponse.json({ok:true});}
    await reply(chatId,"Commands: /ping, /mt5 status, /positions, /kill, /buy SYMBOL LOT sl=PRICE tp=PRICE, /sell SYMBOL LOT sl=PRICE tp=PRICE. Live orders require a previously armed ARCHEON permit.");
    return NextResponse.json({ok:true});
  }catch(e){await audit({event:"telegram.command.error",ok:false,detail:e instanceof Error?e.message:"unknown"});await reply(chatId,`Command failed: ${e instanceof Error?e.message:"unknown error"}`);return NextResponse.json({ok:true});}
}
