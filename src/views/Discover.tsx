import { useEffect, useState } from "react";
import { compactUsd } from "../lib/economics";
import { newest, search, trending, type Pair } from "../lib/dexscreener";
import { isMint, shortKey } from "../lib/solana";
import { useLocal, type Launched } from "../lib/store";

export function WatchButton({ mint }: { mint: string }) {
  const [list, setList] = useLocal<string[]>("watch", []);
  const on = list.includes(mint);
  return (
    <button type="button" className="icon-button" aria-pressed={on} aria-label={on ? "Remove from watchlist" : "Add to watchlist"} onClick={() => setList((l) => (on ? l.filter((x) => x !== mint) : [mint, ...l]))}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>
    </button>
  );
}

export function TokenList({ pairs }: { pairs: Pair[] | null }) {
  if (!pairs) return <ul className="token-list" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <li key={i} className="token-row skeleton" />)}</ul>;
  if (!pairs.length) return <p className="muted">No tokens match.</p>;
  return (
    <ul className="token-list">
      {pairs.map((p) => {
        const ch = p.priceChange?.h24;
        return (
          <li key={p.pairAddress} className="token-row">
            <a className="token-link" href={`#/token/${p.baseToken.address}`}>
              {p.info?.imageUrl ? <img className="thumb" src={p.info.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="thumb thumb-empty" aria-hidden="true" />}
              <span className="token-name"><strong>{p.baseToken.symbol}</strong><span className="muted truncate">{p.baseToken.name}</span></span>
              <span className="token-stat num"><span className="muted">MC</span> {compactUsd(p.marketCap ?? p.fdv)}</span>
              <span className="token-stat num hide-sm"><span className="muted">Vol</span> {compactUsd(p.volume?.h24)}</span>
              <span className={`token-stat num ${ch == null ? "" : ch >= 0 ? "up" : "down"}`}>{ch == null ? "–" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`}</span>
            </a>
            <WatchButton mint={p.baseToken.address} />
          </li>
        );
      })}
    </ul>
  );
}

type Tab = "trending" | "new" | "here" | "search";
export function Discover() {
  const [tab, setTab] = useState<Tab>("trending");
  const [q, setQ] = useState("");
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [err, setErr] = useState("");
  const [launched] = useLocal<Launched[]>("launched", []);

  useEffect(() => {
    if (tab === "here" || tab === "search") return;
    setPairs(null); setErr("");
    (tab === "trending" ? trending() : newest()).then(setPairs).catch(() => setErr("Market data didn't load. Try again in a moment."));
  }, [tab]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    if (isMint(t) && t.length >= 32) { location.hash = `#/token/${t}`; return; }
    setPairs(null); setErr(""); setTab("search");
    search(t).then(setPairs).catch(() => setErr("Search failed. Try again."));
  }

  return (
    <section className="wrap section" aria-labelledby="disc-title">
      <h1 id="disc-title" className="page-title">Discover tokens</h1>
      <form className="search" role="search" onSubmit={onSearch}>
        <label htmlFor="q" className="visually-hidden">Search by name, ticker or mint address</label>
        <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ticker or mint address" />
        <button className="button button-primary" type="submit">Search</button>
      </form>
      <div className="tabs" role="tablist" aria-label="Token lists">
        {([["trending", "Trending"], ["new", "New"], ["here", "Launched here"]] as const).map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === "here" ? (
        launched.length ? (
          <ul className="token-list">
            {launched.map((t) => (
              <li key={t.mint} className="token-row">
                <a className="token-link" href={`#/token/${t.mint}`}>
                  {t.image ? <img className="thumb" src={t.image} alt="" width={40} height={40} /> : <span className="thumb thumb-empty" aria-hidden="true" />}
                  <span className="token-name"><strong>{t.symbol}</strong><span className="muted truncate">{t.name}</span></span>
                  <span className="token-stat"><span className="pill">{t.cluster}</span></span>
                  <span className="token-stat muted num">{shortKey(t.creator)}</span>
                </a>
                <WatchButton mint={t.mint} />
              </li>
            ))}
          </ul>
        ) : <p className="muted">Tokens you launch from this browser appear here. <a href="#/">Create one</a>.</p>
      ) : err ? <p className="error" role="alert">{err}</p> : <TokenList pairs={pairs} />}
      <p className="hint">Trending and new lists show Solana mainnet markets from DexScreener. Tokens still on a LaunchLab curve open by mint address.</p>
    </section>
  );
}
