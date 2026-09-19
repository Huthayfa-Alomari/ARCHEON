import json, sys, math, os

def out(**kw): print(json.dumps(kw, ensure_ascii=False, default=str))
def fail(msg): out(ok=False,error=msg); raise SystemExit(1)
try:
    import MetaTrader5 as mt5
except Exception as e:
    fail("MetaTrader5 Python package unavailable: %s" % e)

payload=json.loads(sys.argv[1] if len(sys.argv)>1 else "{}")
action=payload.get("action")
path=os.getenv("MT5_TERMINAL_PATH") or None
kwargs={}
if os.getenv("MT5_LOGIN"): kwargs["login"]=int(os.getenv("MT5_LOGIN"))
if os.getenv("MT5_PASSWORD"): kwargs["password"]=os.getenv("MT5_PASSWORD")
if os.getenv("MT5_SERVER"): kwargs["server"]=os.getenv("MT5_SERVER")
ok=mt5.initialize(path,**kwargs) if path else mt5.initialize(**kwargs)
if not ok: fail("mt5.initialize failed: %r" % (mt5.last_error(),))
try:
    if action=="status":
        a=mt5.account_info(); t=mt5.terminal_info(); out(ok=True,account=a._asdict() if a else None,terminal=t._asdict() if t else None,version=mt5.version())
    elif action=="positions":
        ps=mt5.positions_get() or []; out(ok=True,positions=[p._asdict() for p in ps])
    elif action=="bars":
        tf=getattr(mt5,"TIMEFRAME_"+str(payload.get("timeframe","M15")).upper(),None)
        if tf is None: fail("Unsupported timeframe")
        rows=mt5.copy_rates_from_pos(payload["symbol"],tf,0,int(payload.get("count",500)))
        if rows is None: fail("copy_rates_from_pos failed: %r" % (mt5.last_error(),))
        out(ok=True,bars=[{k:(int(v) if k in ("time","tick_volume","spread","real_volume") else float(v)) for k,v in zip(rows.dtype.names,row)} for row in rows])
    elif action=="order":
        mode=payload.get("mode","paper"); symbol=payload["symbol"]; side=payload["side"]; volume=float(payload["volume"])
        info=mt5.symbol_info(symbol)
        if info is None: fail("Unknown MT5 symbol")
        if not info.visible and not mt5.symbol_select(symbol,True): fail("Could not select symbol")
        tick=mt5.symbol_info_tick(symbol)
        if tick is None: fail("No symbol tick")
        typ=mt5.ORDER_TYPE_BUY if side=="buy" else mt5.ORDER_TYPE_SELL; price=tick.ask if side=="buy" else tick.bid
        req={"action":mt5.TRADE_ACTION_DEAL,"symbol":symbol,"volume":volume,"type":typ,"price":price,"deviation":int(payload.get("deviation",20)),"magic":int(payload.get("magic",909090)),"comment":str(payload.get("comment","JARVIS"))[:31],"type_time":mt5.ORDER_TIME_GTC,"type_filling":mt5.ORDER_FILLING_IOC}
        if payload.get("sl") is not None: req["sl"]=float(payload["sl"])
        if payload.get("tp") is not None: req["tp"]=float(payload["tp"])
        check=mt5.order_check(req)
        if check is None: fail("order_check failed: %r" % (mt5.last_error(),))
        account=mt5.account_info()
        if account is None: fail("account_info unavailable")
        # Live trades require a stop-loss and must fit the configured per-trade risk cap.
        if mode=="live":
            if req.get("sl") is None or float(req["sl"]) <= 0: fail("Live JARVIS orders require an explicit stop-loss.")
            pnl_at_sl=mt5.order_calc_profit(typ,symbol,volume,price,float(req["sl"]))
            if pnl_at_sl is None: fail("order_calc_profit failed for stop-loss risk check")
            risk_pct=abs(float(pnl_at_sl))/max(float(account.equity),1e-9)*100.0
            max_risk=float(payload.get("maxRiskPct",0.5))
            if risk_pct > max_risk: fail("Trade risk %.3f%% exceeds max %.3f%%" % (risk_pct,max_risk))
            # Daily realized P/L kill switch from broker history, using terminal-local calendar day.
            from datetime import datetime
            now=datetime.now(); start=datetime(now.year,now.month,now.day)
            deals=mt5.history_deals_get(start,now) or []
            realized=sum(float(getattr(d,"profit",0.0))+float(getattr(d,"commission",0.0))+float(getattr(d,"swap",0.0))+float(getattr(d,"fee",0.0)) for d in deals)
            max_daily=float(payload.get("maxDailyLossPct",2.0))
            if realized < -abs(float(account.balance))*max_daily/100.0: fail("Daily loss kill-switch is active.")
        if mode=="paper": out(ok=True,mode="paper",request=req,check=check._asdict()); raise SystemExit(0)
        res=mt5.order_send(req)
        if res is None: fail("order_send failed: %r" % (mt5.last_error(),))
        out(ok=True,mode="live",request=req,check=check._asdict(),result=res._asdict())
    else: fail("Unknown action")
finally:
    mt5.shutdown()
