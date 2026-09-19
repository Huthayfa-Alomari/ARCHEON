import { jarvisConfig } from "./config";
export async function telegramSend(text:string,chatId?:string){
  if(!jarvisConfig.telegramBotToken)throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  const target=chatId||jarvisConfig.telegramDefaultChatId; if(!target)throw new Error("Telegram chat id is missing.");
  if(jarvisConfig.telegramAllowedChatIds.length&&!jarvisConfig.telegramAllowedChatIds.includes(String(target)))throw new Error("Telegram chat id is not allow-listed.");
  const r=await fetch(`https://api.telegram.org/bot${jarvisConfig.telegramBotToken}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:target,text:text.slice(0,4096)})});
  const j=await r.json() as {ok?:boolean;description?:string}; if(!r.ok||!j.ok)throw new Error(j.description||`Telegram HTTP ${r.status}`); return {ok:true,chatId:String(target)};
}
export function telegramAuthorized(chatId:string,secret?:string){
  if(jarvisConfig.telegramWebhookSecret&&secret!==jarvisConfig.telegramWebhookSecret)return false;
  return !jarvisConfig.telegramAllowedChatIds.length||jarvisConfig.telegramAllowedChatIds.includes(chatId);
}
