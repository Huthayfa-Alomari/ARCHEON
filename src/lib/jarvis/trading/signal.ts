import type { StrategySpec } from "../research/types";
import { ictSmcSignal } from "./ict-smc";

type Bar = { time?: number|string; open:number; high:number; low:number; close:number };
function sma(xs:number[],end:number,n:number){if(end+1<n)return NaN;let s=0;for(let i=end-n+1;i<=end;i++)s+=xs[i];return s/n;}
function std(xs:number[],end:number,n:number){const m=sma(xs,end,n);if(!Number.isFinite(m))return NaN;let s=0;for(let i=end-n+1;i<=end;i++)s+=(xs[i]-m)**2;return Math.sqrt(s/n);}
function rsi(xs:number[],end:number,n:number){if(end<n)return NaN;let g=0,l=0;for(let i=end-n+1;i<=end;i++){const d=xs[i]-xs[i-1];if(d>=0)g+=d;else l-=d;}if(l===0)return 100;const rs=(g/n)/(l/n);return 100-100/(1+rs);}
function donchian(bars:Bar[],end:number,n:number){if(end<n)return null;let h=-Infinity,l=Infinity;for(let i=end-n;i<end;i++){h=Math.max(h,bars[i].high);l=Math.min(l,bars[i].low);}return{h,l};}

export function strategySignal(spec:StrategySpec,bars:Bar[]):{signal:-1|0|1;reason:string;price:number} {
  const i=bars.length-1;if(i<5)return{signal:0,reason:"insufficient bars",price:bars.at(-1)?.close||0};
  const c=bars.map(b=>Number(b.close));const p=spec.params;let s:-1|0|1=0;let reason="no setup";
  if(spec.kind==="sma-cross"){
    const f=Math.max(2,Math.round(p.fast||9)),slow=Math.max(f+1,Math.round(p.slow||21));if(i<slow+1)return{signal:0,reason:"warmup",price:c[i]};
    const a=sma(c,i,f),b=sma(c,i,slow),ap=sma(c,i-1,f),bp=sma(c,i-1,slow);if(ap<=bp&&a>b){s=1;reason="bullish MA cross";}else if(ap>=bp&&a<b){s=-1;reason="bearish MA cross";}
  }else if(spec.kind==="rsi-reversion"){
    const v=rsi(c,i,Math.max(2,Math.round(p.period||14)));if(v<(p.oversold||30)){s=1;reason=`RSI oversold ${v.toFixed(1)}`;}else if(v>(p.overbought||70)){s=-1;reason=`RSI overbought ${v.toFixed(1)}`;}
  }else if(spec.kind==="donchian-breakout"){
    const d=donchian(bars,i,Math.max(2,Math.round(p.lookback||20)));if(d&&c[i]>d.h){s=1;reason="Donchian upside breakout";}else if(d&&c[i]<d.l){s=-1;reason="Donchian downside breakout";}
  }else if(spec.kind==="bollinger-reversion"){
    const n=Math.max(2,Math.round(p.period||20)),k=p.dev||2,m=sma(c,i,n),sd=std(c,i,n);if(Number.isFinite(m)&&Number.isFinite(sd)){if(c[i]<m-k*sd){s=1;reason="below lower Bollinger band";}else if(c[i]>m+k*sd){s=-1;reason="above upper Bollinger band";}}
  }else if(spec.kind==="ema-trend-pullback"){
    const f=Math.max(2,Math.round(p.fast||20)),slow=Math.max(f+2,Math.round(p.slow||50)),ef=sma(c,i,f),es=sma(c,i,slow),tol=Math.max(.0001,(p.pullbackPct||.2)/100);if(ef>es&&c[i-1]<=ef*(1+tol)&&c[i]>ef){s=1;reason="trend pullback resumed up";}else if(ef<es&&c[i-1]>=ef*(1-tol)&&c[i]<ef){s=-1;reason="trend pullback resumed down";}
  }else if(spec.kind==="atr-breakout"){
    const n=Math.max(3,Math.round(p.period||14)),look=Math.max(5,Math.round(p.lookback||20)),d=donchian(bars,i,look);let atr=0;for(let j=Math.max(1,i-n+1);j<=i;j++){const pc=bars[j-1].close;atr+=Math.max(bars[j].high-bars[j].low,Math.abs(bars[j].high-pc),Math.abs(bars[j].low-pc));}atr/=Math.min(n,i);if(d&&atr*(p.multiple||1.5)>=(d.h-d.l)/look){if(c[i]>d.h){s=1;reason="ATR-confirmed upside breakout";}else if(c[i]<d.l){s=-1;reason="ATR-confirmed downside breakout";}}
  }else if(spec.kind==="range-fade"){
    const look=Math.max(5,Math.round(p.lookback||30)),edge=Math.max(.01,(p.edgePct||.12)/100),d=donchian(bars,i,look);if(d){const w=d.h-d.l;if(c[i]>=d.h-w*edge){s=-1;reason="range upper-edge fade";}else if(c[i]<=d.l+w*edge){s=1;reason="range lower-edge fade";}}
  }else if(spec.kind==="ict-smc"){
    const x=ictSmcSignal(spec,bars);s=x.signal;reason=x.reason;
  }
  if(spec.direction==="long"&&s<0)s=0;if(spec.direction==="short"&&s>0)s=0;
  return{signal:s,reason,price:c[i]};
}
