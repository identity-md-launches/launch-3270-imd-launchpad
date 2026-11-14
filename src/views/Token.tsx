import { useEffect, useRef, useState } from "react";
import { DEFAULT_SLIPPAGE_BPS, LAUNCHLAB_SUPPLY } from "../config";
import { assessRisk, compactUsd, solToLamports, type Risk } from "../lib/economics";
import { pairsFor, type Pair } from "../lib/dexscreener";
import { explorerAccount, explorerToken, explorerTx, isMint, readMint, recentSignatures, shortKey, topHolders, type MintFacts } from "../lib/solana";
import { notify, useLocal, type Comment, type Launched, type Trade } from "../lib/store";
import type { PoolState } from "../lib/launchlab";
import { useSol } from "../solctx";
import { WatchButton } from "./Discover";

export function TokenPage({ mint }: { mint: string }) {
  const { cluster } = useSol();
  const [pool, setPool] = useState<PoolState | null | undefined>(undefined);
  const [facts, setFacts] = useState<MintFacts | null | undefined>(undefined);
  const [pair, setPair] = useState<Pair | null>(null);
  const [holders, setHolders] = useState<{ address: string; amount: bigint }[]>([]);
  const [activity, setActivity] = useState<{ sig: string; time: number | null; ok: boolean }[]>([]);
  const [prices, setPrices] = useState<number[]>([]);
  const [launched] = useLocal<Launched[]>("launched", []);
  const local = launched.find((l) => l.mint === mint);
  const valid = isMint(mint);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    setPool(undefined); setFacts(undefined); setPair(null); setHolders([]); setPrices([]);
    readMint(cluster, mint).then((f) => alive && setFacts(f)).catch(() => alive && setFacts(null));
    topHolders(cluster, mint).then((h) => alive && setHolders(h)).catch(() => {});
    if (cluster === "mainnet") pairsFor([mint]).then((p) => alive && setPair(p[0] ?? null)).catch(() => {});
    const tick = () => import("../lib/launchlab").then((m) => m.readPool(cluster, mint)).then((p) => {
      if (!alive) return;
      setPool(p);
      if (p) { setPrices((x) => [...x, p.priceSol].slice(-120)); recentSignatures(cluster, p.poolId).then((a) => alive && setActivity(a)).catch(() => {}); }
    }).catch(() => alive && setPool(null));
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [mint, cluster, valid]);

  if (!valid) return <section className="wrap section"><h1 className="page-title">Token not found</h1><p className="muted">That isn't a Solana mint address. <a href="#/discover">Search tokens</a>.</p></section>;

  const name = pair?.baseToken.name ?? local?.name ?? "Token";
  const symbol = pair?.baseToken.symbol ?? local?.symbol ?? shortKey(mint);
  const image = pair?.info?.imageUrl ?? local?.image;
  const supply = facts ? Number(facts.supply) / 10 ** facts.decimals : LAUNCHLAB_SUPPLY;
  const top = holders.map((h) => (Number(h.amount) / 10 ** (facts?.decimals ?? 6) / supply) * 100);
  // The curve's own vault is the largest "holder" while trading; it is not a person.
  const people = pool && !pool.graduated ? top.slice(1) : top;
  const risk: Risk | null = facts ? assessRisk({
    mintAuthority: facts.mintAuthority, freezeAuthority: facts.freezeAuthority,
    topHolderPct: people[0], top10Pct: people.slice(0, 10).reduce((a, b) => a + b, 0),
    liquidityUsd: pair?.liquidity?.usd, ageHours: pair?.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 36e5 : undefined,
  }) : null;
  const share = () => {
    const url = location.href;
    if (navigator.share) navigator.share({ title: `${symbol} on IMD Launchpad`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => notify("Link copied."));
  };

  return (
    <section className="wrap section token-page" aria-labelledby="tok-title">
      <div className="token-head">
        {image ? <img className="thumb thumb-lg" src={image} alt="" width={56} height={56} /> : <span className="thumb thumb-lg thumb-empty" aria-hidden="true" />}
        <div className="token-title">
          <h1 id="tok-title" className="page-title">{name} <span className="muted">{symbol}</span></h1>
          <p className="muted num mono-wrap">{mint}</p>
        </div>
        <div className="actions">
          <WatchButton mint={mint} />
          <button type="button" className="button button-small" onClick={share}>Share</button>
          <a className="button button-small button-quiet" href={`https://x.com/intent/post?text=${encodeURIComponent(`${symbol} on IMD Launchpad`)}&url=${encodeURIComponent(location.href)}`} target="_blank" rel="noreferrer">Post on X</a>
        </div>
      </div>

      <div className="token-grid">
        <div className="stack">
          <div className="card">
            <dl className="stats">
              <div><dt>Price</dt><dd className="num">{pair?.priceUsd ? `$${Number(pair.priceUsd).toPrecision(4)}` : pool ? `${pool.priceSol.toPrecision(4)} SOL` : "–"}</dd></div>
              <div><dt>Market cap</dt><dd className="num">{pair ? compactUsd(pair.marketCap ?? pair.fdv) : pool ? `${(pool.priceSol * supply).toFixed(1)} SOL` : "–"}</dd></div>
              <div><dt>Volume 24h</dt><dd className="num">{compactUsd(pair?.volume?.h24)}</dd></div>
              <div><dt>Liquidity</dt><dd className="num">{pair ? compactUsd(pair.liquidity?.usd) : pool ? `${pool.raisedSol.toFixed(2)} SOL` : "–"}</dd></div>
            </dl>
            {pool && !pool.graduated && (
              <div className="progress-block">
                <div className="field-head"><span>Bonding curve</span><span className="num">{(pool.progress * 100).toFixed(1)}% · {pool.raisedSol.toFixed(2)} of {pool.targetSol.toFixed(0)} SOL</span></div>
                <div className="progress" role="progressbar" aria-label="Bonding curve progress" aria-valuenow={Math.round(pool.progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ inlineSize: `${pool.progress * 100}%` }} /></div>
              </div>
            )}
            {pool?.graduated && <p className="hint">This curve has graduated. Trade it in its Raydium pool.</p>}
            {pool === null && <p className="hint">No LaunchLab curve for this mint on {cluster}.{cluster === "devnet" ? " Switch to Mainnet if it launched there." : ""}</p>}
          </div>
          <div className="card">
            <h2>Chart</h2>
            {pair ? (
              <iframe className="chart-frame" title={`${symbol} chart on DexScreener`} src={`https://dexscreener.com/solana/${pair.pairAddress}?embed=1&theme=dark&info=0&trades=0`} loading="lazy" />
            ) : <Sparkline values={prices} />}
          </div>
          <Activity cluster={cluster} items={activity} />
          <Comments mint={mint} />
        </div>
        <div className="stack">
          <TradeBox mint={mint} symbol={symbol} pool={pool} pair={pair} />
          {risk && (
            <div className="card">
              <h2>Risk check</h2>
              <p className={`risk risk-${risk.level}`}>{risk.level === "low" ? "Low risk signals" : risk.level === "medium" ? "Some risk signals" : "High risk signals"}</p>
              {risk.flags.length ? <ul className="bullets">{risk.flags.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="muted">Mint and freeze authority are revoked and no wallet holds an outsized share.</p>}
              <p className="hint">Read from Solana. Not financial advice.</p>
            </div>
          )}
          <div className="card">
            <h2>Holders</h2>
            {holders.length ? (
              <ol className="holders">
                {holders.slice(0, 10).map((h, i) => (
                  <li key={h.address}><a href={explorerAccount(h.address, cluster)} target="_blank" rel="noreferrer" className="num">{shortKey(h.address)}</a>{i === 0 && pool && !pool.graduated ? <span className="muted"> curve vault</span> : null}<span className="num">{top[i].toFixed(2)}%</span></li>
                ))}
              </ol>
            ) : <p className="muted">Holder data is loading or unavailable on this RPC.</p>}
          </div>
          <div className="card">
            <h2>Links</h2>
            <ul className="link-list">
              <li><a href={explorerToken(mint, cluster)} target="_blank" rel="noreferrer">Solscan</a></li>
              {pair && <li><a href={pair.url} target="_blank" rel="noreferrer">DexScreener</a></li>}
              {cluster === "mainnet" && <li><a href={`https://raydium.io/swap/?inputMint=sol&outputMint=${mint}`} target="_blank" rel="noreferrer">Raydium</a></li>}
              {pool && <li><a href={`#/creator/${pool.creator}`}>Creator profile</a></li>}
              <li><a href={`#/swarm?mint=${mint}&name=${encodeURIComponent(name)}&symbol=${encodeURIComponent(symbol)}`}>Build this project with Swarm</a></li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="muted">The chart fills in as new readings arrive from Solana every 15 seconds.</p>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 300},${100 - ((v - min) / span) * 90 - 5}`).join(" ");
  return <svg className="spark" viewBox="0 0 300 100" role="img" aria-label={`Price from ${min.toPrecision(3)} to ${max.toPrecision(3)} SOL`}><polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function Activity({ cluster, items }: { cluster: "devnet" | "mainnet"; items: { sig: string; time: number | null; ok: boolean }[] }) {
  return (
    <div className="card">
      <h2>Live activity</h2>
      {items.length ? (
        <ul className="activity">
          {items.map((a) => (
            <li key={a.sig}><a className="num" href={explorerTx(a.sig, cluster)} target="_blank" rel="noreferrer">{shortKey(a.sig)}</a><span className="muted num">{a.time ? new Date(a.time * 1000).toLocaleTimeString() : ""}</span><span className={a.ok ? "up" : "down"}>{a.ok ? "Confirmed" : "Failed"}</span></li>
          ))}
        </ul>
      ) : <p className="muted">Curve transactions appear here as they confirm.</p>}
    </div>
  );
}

function TradeBox({ mint, symbol, pool, pair }: { mint: string; symbol: string; pool: PoolState | null | undefined; pair: Pair | null }) {
  const { address, provider, cluster, openConnect } = useSol();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(String(DEFAULT_SLIPPAGE_BPS / 100));
  const [state, setState] = useState<{ busy?: boolean; err?: string; sig?: string }>({});
  const [, setTrades] = useLocal<Trade[]>("trades", []);
  const inFlight = useRef(false);

  if (pool?.graduated || (pool === null && pair)) return (
    <div className="card"><h2>Trade</h2><p className="muted">This token trades in a Raydium pool.</p>
      <a className="button button-primary button-wide" href={`https://raydium.io/swap/?inputMint=sol&outputMint=${mint}`} target="_blank" rel="noreferrer">Trade on Raydium</a></div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !provider) return openConnect();
    if (inFlight.current) return;
    const n = Number(amount), s = Number(slip);
    if (!(n > 0)) return setState({ err: side === "buy" ? "Enter how much SOL to spend." : `Enter how many ${symbol} to sell.` });
    if (!(s > 0 && s <= 50)) return setState({ err: "Set slippage between 0.1% and 50%." });
    inFlight.current = true; setState({ busy: true });
    try {
      const { trade } = await import("../lib/launchlab");
      const raw = side === "buy" ? solToLamports(amount) : BigInt(Math.floor(n * 1e6));
      const sig = await trade(cluster, provider, mint, side, raw, Math.round(s * 100));
      setTrades((t) => [{ mint, symbol, side, amount, sig, cluster, at: Date.now() }, ...t].slice(0, 200));
      notify(`${side === "buy" ? "Bought" : "Sold"} ${symbol}.`, explorerTx(sig, cluster));
      setState({ sig }); setAmount("");
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setState({ err: /reject|denied|cancel/i.test(m) ? "You declined the signature. Nothing was sent." : `The trade didn't go through: ${m}` });
    } finally { inFlight.current = false; }
  }

  return (
    <form className="card" onSubmit={submit} aria-labelledby="trade-title">
      <h2 id="trade-title">Trade on the curve</h2>
      <div className="segmented" role="group" aria-label="Side">
        <button type="button" aria-pressed={side === "buy"} onClick={() => setSide("buy")}>Buy</button>
        <button type="button" aria-pressed={side === "sell"} onClick={() => setSide("sell")}>Sell</button>
      </div>
      <div className="field"><label htmlFor="t-amt">{side === "buy" ? "SOL to spend" : `${symbol} to sell`}</label><input id="t-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={side === "buy" ? "0.1" : "100000"} /></div>
      <div className="field"><label htmlFor="t-slip">Slippage (%)</label><input id="t-slip" inputMode="decimal" value={slip} onChange={(e) => setSlip(e.target.value)} /></div>
      {state.err && <p className="error" role="alert">{state.err}</p>}
      {state.sig && <p className="hint" role="status">Confirmed. <a href={explorerTx(state.sig, cluster)} target="_blank" rel="noreferrer">View transaction</a></p>}
      <button type="submit" className="button button-primary button-wide" disabled={state.busy || pool === undefined}>
        {!address ? "Connect to trade" : state.busy ? "Waiting for your wallet…" : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
      </button>
      <p className="hint">The minimum you receive is protected by your slippage setting.</p>
    </form>
  );
}

function Comments({ mint }: { mint: string }) {
  const { address } = useSol();
  const [all, setAll] = useLocal<Comment[]>("comments", []);
  const [text, setText] = useState("");
  const list = all.filter((c) => c.mint === mint);
  return (
    <div className="card">
      <h2>Discussion</h2>
      <form className="comment-form" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setAll((a) => [{ id: crypto.randomUUID(), mint, author: address ? shortKey(address) : "You", text: t.slice(0, 500), at: Date.now() }, ...a]); setText(""); }}>
        <label htmlFor="c-text" className="visually-hidden">Write a note</label>
        <textarea id="c-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note about this token" maxLength={500} />
        <button type="submit" className="button button-small">Post</button>
      </form>
      {list.length ? <ul className="comments">{list.map((c) => <li key={c.id}><p><strong className="num">{c.author}</strong> <span className="muted">{new Date(c.at).toLocaleString()}</span></p><p>{c.text}</p></li>)}</ul> : <p className="muted">No notes yet.</p>}
      <p className="hint">Notes are kept in this browser. A shared, moderated thread needs a community service the owner connects.</p>
    </div>
  );
}
