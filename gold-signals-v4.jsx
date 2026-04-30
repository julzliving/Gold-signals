import { useState, useEffect, useCallback } from "react";

const SYSTEM_PROMPT = `You are an elite XAU/USD (Gold) trading signal analyst using SMC + technical indicators.

Trader setup:
- TradingView: Luxalgo SMC (BOS, ChoCH, Order Blocks, EQH/EQL) + HalfTrend
- MT5: EMA 20/50/200, Bollinger Bands, RSI(13), ATR(14), MACD(12,26,9), Fractals
- Account: 100 EUR, max risk 2-3 EUR per trade, 0.01 lot size
- Strategy: SMC Confluence only trade when 4+ indicators agree

CRITICAL TRADE LEVEL RULES NEVER VIOLATE:
- SELL: stopLoss must be 10-15 pts ABOVE entry. tp1/tp2/tp3 must be BELOW entry.
- BUY: stopLoss must be 10-15 pts BELOW entry. tp1/tp2/tp3 must be ABOVE entry.
- tp1 = entry +/- 12pts, tp2 = entry +/- 25pts, tp3 = entry +/- 40pts
- NEVER set stopLoss equal to or within 5pts of entry

Respond ONLY with raw JSON, no markdown, no backticks:
{"signal":"SELL","bias":"BEARISH","strength":"STRONG","confidence":78,"entry":4640.00,"stopLoss":4652.00,"tp1":4628.00,"tp2":4615.00,"tp3":4600.00,"rr":"1:2","smcContext":{"structure":"BOS Bearish","orderBlock":"4660-4665","liquidity":"Below 4623","trend":"BEARISH"},"indicators":{"ema":"price below all EMAs","rsi":36,"macd":"bearish","bollingerBands":"at lower band","atr":11},"confluenceScore":5,"confluenceFactors":["Below EMA200","MACD negative","Bearish BOS","RSI sub-40","ATR expanding"],"reasoning":"2-3 sentence analysis.","invalidation":"Break above 4660 on H1","sessionContext":"London","riskNote":"Use 0.01 lot only","nextKeyLevel":4600}`;

function getSessionInfo() {
  const now = new Date();
  const utc = now.getUTCHours() + now.getUTCMinutes() / 60;
  let session = "Asian";
  if (utc >= 13 && utc < 17) session = "London/NY Overlap";
  else if (utc >= 8 && utc < 17) session = "London";
  else if (utc >= 13 && utc < 22) session = "New York";
  else if (utc >= 0 && utc < 9) session = "Tokyo";
  else if (utc >= 22 || utc < 7) session = "Sydney";
  return {
    session,
    localTime: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    utcTime: now.toUTCString().slice(17, 22) + " UTC",
  };
}

function fixLevels(p, price) {
  const entry = typeof p.entry === "number" && p.entry > 3000 ? p.entry : price;
  p.entry = entry;
  if (p.signal === "SELL") {
    if (!p.stopLoss || p.stopLoss < entry + 8) p.stopLoss = +(entry + 12).toFixed(2);
    if (!p.tp1 || p.tp1 >= entry) p.tp1 = +(entry - 12).toFixed(2);
    if (!p.tp2 || p.tp2 >= entry) p.tp2 = +(entry - 25).toFixed(2);
    if (!p.tp3 || p.tp3 >= entry) p.tp3 = +(entry - 40).toFixed(2);
  } else if (p.signal === "BUY") {
    if (!p.stopLoss || p.stopLoss > entry - 8) p.stopLoss = +(entry - 12).toFixed(2);
    if (!p.tp1 || p.tp1 <= entry) p.tp1 = +(entry + 12).toFixed(2);
    if (!p.tp2 || p.tp2 <= entry) p.tp2 = +(entry + 25).toFixed(2);
    if (!p.tp3 || p.tp3 <= entry) p.tp3 = +(entry + 40).toFixed(2);
  }
  const slD = Math.abs(entry - p.stopLoss);
  const t1D = Math.abs(p.tp1 - entry);
  if (slD > 0) p.rr = `1:${(t1D / slD).toFixed(1)}`;
  return p;
}

const T = {
  bg: "#040710",
  surface: "rgba(255,255,255,0.025)",
  border: "rgba(255,255,255,0.07)",
  sell: "#ff2d55",
  buy: "#00e5a0",
  wait: "#ffcc00",
  gold: "#ffd060",
  text: "#dde6f5",
  dim: "rgba(221,230,245,0.38)",
};

const sigColor = (s) => s === "BUY" ? T.buy : s === "SELL" ? T.sell : T.wait;
const outcomeColor = (o) => ["TP1","TP2","TP3","WIN"].includes(o) ? T.buy : o === "SL" || o === "LOSS" ? T.sell : T.dim;
const confColor = (c) => c >= 70 ? T.buy : c >= 45 ? T.wait : T.sell;

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "52px 0" }}>
      <div style={{ width: 38, height: 38, margin: "0 auto 14px", border: `2px solid ${T.border}`, borderTopColor: T.gold, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      <div style={{ color: T.dim, fontSize: 10, letterSpacing: 4 }}>SCANNING MARKET</div>
      <div style={{ color: T.gold, fontSize: 9, marginTop: 5 }}>Analysing SMC + All Indicators...</div>
    </div>
  );
}

function Card({ children, accent, mb = 10 }) {
  return (
    <div style={{ background: accent ? `${accent}07` : T.surface, border: `1px solid ${accent ? accent + "28" : T.border}`, borderRadius: 14, padding: "13px 14px", marginBottom: mb }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 8, letterSpacing: 4, color: T.dim, marginBottom: 9, textTransform: "uppercase" }}>{children}</div>;
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
      <span style={{ color: T.dim, fontFamily: "monospace" }}>{label}</span>
      <span style={{ color: color || T.text, fontWeight: 700, fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

function LevelRow({ label, value, color, price }) {
  const diff = price && value ? (value - price).toFixed(1) : null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", marginBottom: 4, borderRadius: 7, background: `${color}0e`, borderLeft: `3px solid ${color}70` }}>
      <span style={{ fontSize: 10, color: T.dim }}>{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {diff !== null && <span style={{ fontSize: 9, color: T.dim }}>({diff > 0 ? "+" : ""}{diff})</span>}
        <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "monospace" }}>{value?.toFixed(2)}</span>
      </div>
    </div>
  );
}

function ConfBar({ score }) {
  const c = score >= 4 ? T.buy : score >= 3 ? T.wait : T.sell;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 8, color: T.dim, letterSpacing: 3 }}>CONFLUENCE</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: c }}>{score}/6</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 4 }}>
        <div style={{ width: `${(score / 6) * 100}%`, height: "100%", borderRadius: 4, background: c, boxShadow: `0 0 8px ${c}88`, transition: "width 1.1s ease" }} />
      </div>
    </div>
  );
}

function OBtn({ label, val, color, sel, onPick }) {
  return (
    <button onClick={() => onPick(val)} style={{
      background: sel ? `${color}22` : "rgba(255,255,255,0.04)",
      border: `1px solid ${sel ? color : "rgba(255,255,255,0.09)"}`,
      borderRadius: 8, padding: "9px 4px", color: sel ? color : T.dim,
      fontSize: 10, cursor: "pointer", fontFamily: "monospace", fontWeight: 700,
      boxShadow: sel ? `0 0 10px ${color}44` : "none", transition: "all .15s"
    }}>{label}</button>
  );
}

export default function GoldSignals() {
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [rawErr, setRawErr] = useState(null);
  const [price, setPrice] = useState(4629.97);
  const [priceInput, setPriceInput] = useState("");
  const [autoOn, setAutoOn] = useState(false);
  const [cd, setCd] = useState(300);
  const [sigHistory, setSigHistory] = useState([]);
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState("signal");
  // Journal
  const [journal, setJournal] = useState([]);
  const [pending, setPending] = useState(null);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const wins = journal.filter(j => ["TP1","TP2","TP3","WIN"].includes(j.outcome)).length;
  const losses = journal.filter(j => ["SL","LOSS"].includes(j.outcome)).length;
  const wr = journal.length > 0 ? Math.round((wins / journal.length) * 100) : 0;

  const journalCtx = journal.slice(0, 6).map(j =>
    `${j.date} ${j.signal} @${j.entry?.toFixed(2)} SL:${j.sl?.toFixed(2)} result:${j.outcome}${j.note ? " note:" + j.note : ""}`
  ).join(" | ");

  const fetchSignal = useCallback(async (p) => {
    setLoading(true); setErrMsg(null); setRawErr(null);
    const si = getSessionInfo();
    try {
      const msg = `XAU/USD price: ${p}
Time: ${si.localTime} local | ${si.utcTime} | Session: ${si.session}
Date: ${new Date().toDateString()}

Indicators:
RSI(13) ~36 approaching oversold
MACD -13.2/-12.4 strongly bearish deep negative  
ATR(14) ~11.5 elevated volatility
EMA20 EMA50 EMA200 all far above price extreme bearish
Bollinger Bands price at lower band
Luxalgo SMC multiple BOS bearish CHoCH attempts failing
HalfTrend red cloud H1 and H4
Support at 4623 then 4600

Price history: 4760 Apr22 to 4687 Apr27 to 4630 Apr28. 51pt drop today.
BOS confirmed at 4680 4660 4640.

Trade history context: ${journalCtx || "No trades logged yet"}

Generate signal JSON now.`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-calls": "true" },
        body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 900, system: SYSTEM_PROMPT, messages: [{ role: "user", content: msg }] })
      });

      if (!resp.ok) { const e = await resp.text(); setRawErr(`HTTP ${resp.status}: ${e}`); throw new Error(`API ${resp.status}`); }

      const json = await resp.json();
      const raw = json.content?.[0]?.text ?? "";
      const clean = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();

      let parsed;
      try { parsed = JSON.parse(clean); }
      catch (e) { setRawErr(`Parse failed: ${raw.slice(0, 200)}`); throw new Error("JSON parse failed"); }

      parsed = fixLevels(parsed, p);
      setSignal(parsed);

      const now = new Date();
      setSigHistory(h => [{ time: now.toLocaleTimeString(), price: p, signal: parsed.signal, conf: parsed.confidence }, ...h].slice(0, 8));
      setPending({ date: now.toLocaleDateString(), time: now.toLocaleTimeString(), signal: parsed.signal, entry: parsed.entry, sl: parsed.stopLoss, tp1: parsed.tp1, tp2: parsed.tp2, tp3: parsed.tp3 });
      setOutcome(""); setNote("");
      setCd(300);
    } catch (e) {
      setErrMsg(e.message || "Analysis failed");
    } finally { setLoading(false); }
  }, [journalCtx]);

  useEffect(() => { fetchSignal(price); }, []);

  useEffect(() => {
    if (!autoOn) return;
    const t = setInterval(() => setCd(c => { if (c <= 1) { fetchSignal(price); return 300; } return c - 1; }), 1000);
    return () => clearInterval(t);
  }, [autoOn, price, fetchSignal]);

  const submitPrice = () => {
    const p = parseFloat(priceInput);
    if (p > 3000 && p < 7000) { setPrice(p); fetchSignal(p); setPriceInput(""); }
  };

  const saveOutcome = () => {
    if (!pending || !outcome) return;
    setJournal(j => [{ ...pending, outcome, note, loggedAt: new Date().toLocaleTimeString() }, ...j].slice(0, 30));
    setPending(null); setOutcome(""); setNote("");
  };

  const sc = signal ? sigColor(signal.signal) : T.wait;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Courier New', monospace", padding: "16px 14px", maxWidth: 500, margin: "0 auto", backgroundImage: "radial-gradient(ellipse at 10% 0%, rgba(255,208,60,0.04) 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(255,45,85,0.04) 0%, transparent 55%)" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .fade { animation: fadeUp .4s ease; }
        button { transition: all .15s ease; }
        button:hover { filter: brightness(1.1); }
        button:active { transform: scale(.96); }
        input:focus { outline: none; border-color: rgba(255,208,60,.5) !important; }
      `}</style>

      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 8, letterSpacing: 6, color: T.dim, marginBottom: 5 }}>XAU/USD · SMC CONFLUENCE v4</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: T.gold, letterSpacing: 4 }}>GOLD</div>
        <div style={{ fontSize: 10, color: T.dim, marginTop: 4 }}>{getSessionInfo().session} Session</div>
        <div style={{ fontSize: 11, color: T.gold, marginTop: 3 }}>🕐 {getSessionInfo().localTime} · {getSessionInfo().utcTime}</div>
      </div>

      {/* PRICE INPUT */}
      <Card mb={12}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, color: T.dim, letterSpacing: 3, marginBottom: 3 }}>SPOT PRICE</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: T.gold }}>{price.toFixed(2)}</div>
          </div>
          <input value={priceInput} onChange={e => setPriceInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submitPrice()}
            placeholder="New price..." style={{ width: 100, background: "rgba(255,255,255,0.06)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 10px", color: T.text, fontSize: 12, fontFamily: "monospace" }} />
          <button onClick={submitPrice} style={{ background: `${T.gold}1e`, border: `1px solid ${T.gold}40`, borderRadius: 8, padding: "9px 14px", color: T.gold, fontSize: 12, cursor: "pointer", fontFamily: "monospace", fontWeight: 900 }}>GO</button>
        </div>
      </Card>

      {/* TABS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
        {[["signal", "📡  SIGNAL"], ["journal", `📓  JOURNAL (${journal.length})`]].map(([tab, lbl]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? `${T.gold}18` : "rgba(255,255,255,0.03)",
            border: `1px solid ${activeTab === tab ? T.gold + "50" : T.border}`,
            borderRadius: 10, padding: "11px", color: activeTab === tab ? T.gold : T.dim,
            fontSize: 10, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, letterSpacing: 1
          }}>{lbl}</button>
        ))}
      </div>

      {/* ══ SIGNAL TAB ══ */}
      {activeTab === "signal" && (
        <>
          {errMsg && (
            <Card accent={T.sell} mb={12}>
              <div style={{ color: T.sell, fontSize: 12, marginBottom: 4 }}>⚠ {errMsg}</div>
              {rawErr && <div style={{ color: T.dim, fontSize: 9, wordBreak: "break-all", marginBottom: 6 }}>{rawErr}</div>}
              <button onClick={() => fetchSignal(price)} style={{ background: `${T.sell}20`, border: `1px solid ${T.sell}44`, borderRadius: 6, padding: "6px 12px", color: T.sell, fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}>RETRY</button>
            </Card>
          )}

          {loading ? <Spinner /> : signal && !errMsg ? (
            <div className="fade">

              {/* MAIN SIGNAL */}
              <Card accent={sc} mb={10}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 46, fontWeight: 900, color: sc, letterSpacing: 2, lineHeight: 1, textShadow: `0 0 30px ${sc}77` }}>{signal.signal}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                      {[signal.strength, signal.bias, signal.sessionContext || getSessionInfo().session].map((t, i) => (
                        <span key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: i === 1 ? (signal.bias === "BEARISH" ? T.sell : signal.bias === "BULLISH" ? T.buy : T.wait) : sc }}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 32, fontWeight: 900, color: confColor(signal.confidence) }}>{signal.confidence}%</div>
                    <div style={{ fontSize: 8, color: T.dim, letterSpacing: 2 }}>CONFIDENCE</div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 3 }}>R:R {signal.rr}</div>
                  </div>
                </div>
                <ConfBar score={signal.confluenceScore} />
                {signal.confluenceFactors?.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 9 }}>
                    {signal.confluenceFactors.map((f, i) => (
                      <span key={i} style={{ fontSize: 9, color: T.dim, background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 6px" }}>✓ {f}</span>
                    ))}
                  </div>
                )}
              </Card>

              {/* TRADE LEVELS */}
              <Card mb={10}>
                <Label>Trade Levels</Label>
                <LevelRow label="ENTRY"     value={signal.entry}    color="#ffffff" price={price} />
                <LevelRow label="STOP LOSS" value={signal.stopLoss} color={T.sell}  price={price} />
                <LevelRow label="TARGET 1"  value={signal.tp1}      color={T.buy}   price={price} />
                <LevelRow label="TARGET 2"  value={signal.tp2}      color="#00b87c" price={price} />
                <LevelRow label="TARGET 3"  value={signal.tp3}      color="#007a50" price={price} />
                {signal.nextKeyLevel && (
                  <div style={{ marginTop: 8, padding: "5px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 6, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 9, color: T.dim }}>NEXT KEY LEVEL</span>
                    <span style={{ fontSize: 11, color: T.gold, fontWeight: 700 }}>{signal.nextKeyLevel?.toFixed(2)}</span>
                  </div>
                )}
              </Card>

              {/* SMC CONTEXT */}
              <Card mb={10}>
                <Label>SMC Context</Label>
                <Row label="STRUCTURE"   value={signal.smcContext?.structure}  color={T.gold} />
                <Row label="ORDER BLOCK" value={signal.smcContext?.orderBlock} color={T.wait} />
                <Row label="LIQUIDITY"   value={signal.smcContext?.liquidity}  color={T.sell} />
                <Row label="HTF TREND"   value={signal.smcContext?.trend}      color={signal.smcContext?.trend === "BEARISH" ? T.sell : T.buy} />
              </Card>

              {/* INDICATORS */}
              <Card mb={10}>
                <Label>Indicator Readings</Label>
                <Row label="EMA 20/50/200" value={signal.indicators?.ema}            color={signal.indicators?.ema?.includes("below") ? T.sell : T.buy} />
                <Row label="RSI(13)"       value={signal.indicators?.rsi}            color={signal.indicators?.rsi < 35 ? T.buy : signal.indicators?.rsi > 65 ? T.sell : T.wait} />
                <Row label="MACD"          value={signal.indicators?.macd}           color={signal.indicators?.macd?.includes("bull") ? T.buy : T.sell} />
                <Row label="BOLLINGER"     value={signal.indicators?.bollingerBands} color={T.text} />
                <Row label="ATR(14)"       value={`${signal.indicators?.atr} pts`}   color={T.dim} />
              </Card>

              {/* ANALYSIS */}
              <Card mb={10}>
                <Label>Analysis</Label>
                <p style={{ fontSize: 12, color: T.text, lineHeight: 1.75, margin: "0 0 10px" }}>{signal.reasoning}</p>
                <div style={{ background: `${T.sell}0b`, border: `1px solid ${T.sell}22`, borderRadius: 7, padding: "8px 10px" }}>
                  <div style={{ fontSize: 8, color: T.sell, letterSpacing: 2, marginBottom: 3 }}>TRADE INVALIDATION</div>
                  <div style={{ fontSize: 11, color: "rgba(255,80,80,.7)" }}>{signal.invalidation}</div>
                </div>
              </Card>

              {/* RISK NOTE */}
              <div style={{ background: `${T.wait}08`, border: `1px solid ${T.wait}20`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: T.wait }}>⚠ </span>
                <span style={{ fontSize: 11, color: `${T.wait}aa` }}>{signal.riskNote}</span>
              </div>

              {/* ── LOG OUTCOME PANEL ── */}
              {pending && (
                <Card accent={T.gold} mb={10}>
                  <Label>Log This Trade Outcome</Label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
                    <span style={{ fontWeight: 900, color: sigColor(pending.signal) }}>{pending.signal}</span>
                    <span style={{ color: T.dim }}>Entry: <b style={{ color: T.text }}>{pending.entry?.toFixed(2)}</b></span>
                    <span style={{ color: T.sell }}>SL: {pending.sl?.toFixed(2)}</span>
                    <span style={{ color: T.buy }}>TP1: {pending.tp1?.toFixed(2)}</span>
                    <span style={{ color: "#00b87c" }}>TP2: {pending.tp2?.toFixed(2)}</span>
                  </div>

                  <div style={{ fontSize: 9, color: T.dim, letterSpacing: 2, marginBottom: 7 }}>WHAT WAS THE RESULT?</div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 6 }}>
                    <OBtn label="HIT SL"  val="SL"  color={T.sell} sel={outcome === "SL"}  onPick={setOutcome} />
                    <OBtn label="HIT TP1" val="TP1" color={T.buy}  sel={outcome === "TP1"} onPick={setOutcome} />
                    <OBtn label="HIT TP2" val="TP2" color={T.buy}  sel={outcome === "TP2"} onPick={setOutcome} />
                    <OBtn label="HIT TP3" val="TP3" color={T.buy}  sel={outcome === "TP3"} onPick={setOutcome} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 8 }}>
                    <OBtn label="CLOSE +"  val="WIN"     color={T.buy}  sel={outcome === "WIN"}     onPick={setOutcome} />
                    <OBtn label="CLOSE -"  val="LOSS"    color={T.sell} sel={outcome === "LOSS"}    onPick={setOutcome} />
                    <OBtn label="NO TRADE" val="SKIPPED" color={T.dim}  sel={outcome === "SKIPPED"} onPick={setOutcome} />
                  </div>

                  <input value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Notes: moved SL, news hit, hesitated..."
                    style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.text, fontSize: 11, fontFamily: "monospace", marginBottom: 8, boxSizing: "border-box" }} />

                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={saveOutcome} disabled={!outcome} style={{
                      flex: 1, background: outcome ? `${T.gold}20` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${outcome ? T.gold + "44" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 9, padding: 11, color: outcome ? T.gold : T.dim,
                      fontSize: 11, cursor: outcome ? "pointer" : "not-allowed", fontFamily: "monospace", fontWeight: 700
                    }}>💾 SAVE TO JOURNAL</button>
                    <button onClick={() => setPending(null)} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 9, padding: "11px 14px", color: T.dim, fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>SKIP</button>
                  </div>
                </Card>
              )}

              {/* SIGNAL HISTORY */}
              {sigHistory.length > 1 && (
                <Card mb={10}>
                  <Label>Signal History</Label>
                  {sigHistory.map((h, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < sigHistory.length - 1 ? `1px solid ${T.border}` : "none", fontSize: 10 }}>
                      <span style={{ color: T.dim }}>{h.time}</span>
                      <span style={{ color: T.gold, fontFamily: "monospace" }}>{h.price?.toFixed(2)}</span>
                      <span style={{ fontWeight: 700, color: sigColor(h.signal) }}>{h.signal}</span>
                      <span style={{ color: confColor(h.conf) }}>{h.conf}%</span>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          ) : null}

          {/* CONTROLS */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => fetchSignal(price)} disabled={loading} style={{
              flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`,
              borderRadius: 10, padding: 13, color: T.text, fontSize: 11,
              cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", letterSpacing: 1.5, opacity: loading ? .5 : 1
            }}>{loading ? "SCANNING..." : "↻  REFRESH SIGNAL"}</button>
            <button onClick={() => setAutoOn(a => !a)} style={{
              background: autoOn ? `${T.buy}12` : "rgba(255,255,255,0.03)",
              border: `1px solid ${autoOn ? T.buy + "40" : T.border}`,
              borderRadius: 10, padding: "13px 14px", color: autoOn ? T.buy : T.dim,
              fontSize: 10, cursor: "pointer", fontFamily: "monospace"
            }}>{autoOn ? `AUTO\n${cd}s` : "AUTO\nOFF"}</button>
          </div>

          {/* ACCOUNT RULES */}
          <Card>
            <Label>€100 Account Rules</Label>
            {[["MAX RISK/TRADE","€2–3"],["LOT SIZE","0.01"],["MAX TRADES/DAY","2"],["2 LOSSES ROW","Stop for day"],["MIN CONFLUENCE","4/6"],["HIT TP1","Move SL to entry"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 10 }}>
                <span style={{ color: T.dim }}>{k}</span>
                <span style={{ color: T.gold, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* ══ JOURNAL TAB ══ */}
      {activeTab === "journal" && (
        <div className="fade">

          {/* STATS ROW */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
            {[
              { lbl: "TRADES", val: journal.length, c: T.gold },
              { lbl: "WINS",   val: wins,            c: T.buy  },
              { lbl: "LOSSES", val: losses,           c: T.sell },
              { lbl: "WIN %",  val: `${wr}%`,         c: wr >= 50 ? T.buy : T.sell },
            ].map(({ lbl, val, c }) => (
              <div key={lbl} style={{ background: `${c}0d`, border: `1px solid ${c}28`, borderRadius: 10, padding: "11px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: c }}>{val}</div>
                <div style={{ fontSize: 8, color: T.dim, letterSpacing: 2, marginTop: 2 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* OUTCOME BREAKDOWN */}
          {journal.length > 0 && (
            <Card mb={10}>
              <Label>Outcome Breakdown</Label>
              {["TP3","TP2","TP1","WIN","LOSS","SL","SKIPPED"].map(o => {
                const cnt = journal.filter(j => j.outcome === o).length;
                if (!cnt) return null;
                const pct = Math.round((cnt / journal.length) * 100);
                const c = ["TP1","TP2","TP3","WIN"].includes(o) ? T.buy : o === "SKIPPED" ? T.dim : T.sell;
                return (
                  <div key={o} style={{ marginBottom: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: c, fontWeight: 700 }}>{o}</span>
                      <span style={{ fontSize: 10, color: T.dim }}>{cnt}× · {pct}%</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 3 }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: c }} />
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {/* JOURNAL ENTRIES */}
          {journal.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 20px", color: T.dim }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📓</div>
              <div style={{ fontSize: 12, letterSpacing: 1 }}>No trades logged yet</div>
              <div style={{ fontSize: 10, marginTop: 6, color: "rgba(221,230,245,0.18)" }}>After each signal, tap SAVE TO JOURNAL</div>
            </div>
          ) : (
            <>
              {journal.map((j, i) => (
                <Card key={i} accent={outcomeColor(j.outcome)} mb={8}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: sigColor(j.signal) }}>{j.signal}</span>
                      <span style={{ fontSize: 11, color: T.dim }}>@ {j.entry?.toFixed(2)}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: outcomeColor(j.outcome), background: `${outcomeColor(j.outcome)}15`, border: `1px solid ${outcomeColor(j.outcome)}33`, borderRadius: 6, padding: "2px 9px" }}>{j.outcome}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, fontSize: 10, color: T.dim, flexWrap: "wrap" }}>
                    <span>SL {j.sl?.toFixed(2)}</span>
                    <span>TP1 {j.tp1?.toFixed(2)}</span>
                    <span>TP2 {j.tp2?.toFixed(2)}</span>
                    <span style={{ marginLeft: "auto" }}>{j.date} · {j.time}</span>
                  </div>
                  {j.note && (
                    <div style={{ marginTop: 6, fontSize: 10, color: T.dim, fontStyle: "italic", padding: "5px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 5 }}>
                      📝 {j.note}
                    </div>
                  )}
                </Card>
              ))}
              <button onClick={() => { if (window.confirm("Clear all journal entries?")) setJournal([]); }}
                style={{ width: "100%", background: `${T.sell}0e`, border: `1px solid ${T.sell}22`, borderRadius: 9, padding: 10, color: T.sell, fontSize: 10, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2, marginTop: 4 }}>
                🗑 CLEAR ALL ENTRIES
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 8, color: "rgba(255,255,255,0.1)", letterSpacing: 3 }}>
        GOLD SMC v4 · {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
