import { useEffect, useState } from "react";
import { formatUnits } from "../lib/economics";
import { explorerAccount, explorerTx, recentSignatures, shortKey, solBalance, walletTokens } from "../lib/solana";
import { useLocal, type Launched, type Note, type Trade } from "../lib/store";
import { useSol } from "../solctx";
import { pairsFor, type Pair } from "../lib/dexscreener";
import { TokenList } from "./Discover";

export function Portfolio() {
  const { address, cluster, openConnect } = useSol();
  const [tokens, setTokens] = useState<{ mint: string; ui: string }[] | null>(null);
  const [sol, setSol] = useState<bigint | null>(null);
  const [trades] = useLocal<Trade[]>("trades", []);
  const [notes, setNotes] = useLocal<Note[]>("notes", []);
  const [watch] = useLocal<string[]>("watch", []);
  const [watchPairs, setWatchPairs] = useState<Pair[] | null>(null);
  useEffect(() => {
    if (!address) return;
    setTokens(null);
    walletTokens(cluster, address).then(setTokens).catch(() => setTokens([]));
    solBalance(cluster, address).then(setSol).catch(() => {});
  }, [address, cluster]);
  useEffect(() => { pairsFor(watch).then(setWatchPairs).catch(() => setWatchPairs([])); }, [watch.join()]); // eslint-disable-line
  useEffect(() => () => setNotes((n) => n.map((x) => ({ ...x, read: true }))), []); // eslint-disable-line

  return (
    <section className="wrap section" aria-labelledby="pf-title">
      <h1 id="pf-title" className="page-title">Portfolio</h1>
      <div className="token-grid">
        <div className="stack">
          <div className="card">
            <h2>Holdings on {cluster}</h2>
            {!address ? <button type="button" className="button button-primary" onClick={openConnect}>Connect a Solana wallet</button> : (
              <>
                <p className="num">{sol != null ? `${formatUnits(sol, 9)} SOL` : "…"}</p>
                {tokens === null ? <p className="muted">Reading token accounts…</p> : tokens.length ? (
                  <ul className="holders">{tokens.map((t) => <li key={t.mint}><a href={`#/token/${t.mint}`} className="num">{shortKey(t.mint)}</a><span className="num">{t.ui}</span></li>)}</ul>
                ) : <p className="muted">No tokens in this wallet on {cluster}.</p>}
              </>
            )}
          </div>
          <div className="card">
            <h2>Watchlist</h2>
            {watch.length ? <TokenList pairs={watchPairs} /> : <p className="muted">Star a token to follow its market here.</p>}
            {watch.length > 0 && watchPairs && watchPairs.length < watch.length && <p className="hint">Tokens still on a curve have no DexScreener market yet. Open them from Discover.</p>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Notifications</h2>
            {notes.length ? <ul className="activity">{notes.slice(0, 15).map((n) => <li key={n.id}>{n.href ? <a href={n.href}>{n.text}</a> : <span>{n.text}</span>}<span className="muted num">{new Date(n.at).toLocaleTimeString()}</span></li>)}</ul> : <p className="muted">Launches, trades and Swarm updates appear here.</p>}
            {"Notification" in window && Notification.permission === "default" && <button type="button" className="link-button" onClick={() => Notification.requestPermission()}>Also notify me in the browser</button>}
          </div>
          <div className="card">
            <h2>Trading history</h2>
            {trades.length ? <ul className="activity">{trades.slice(0, 20).map((t) => <li key={t.sig}><span className={t.side === "buy" ? "up" : "down"}>{t.side === "buy" ? "Buy" : "Sell"}</span><span className="num">{t.amount} {t.side === "buy" ? "SOL" : t.symbol}</span><a href={explorerTx(t.sig, t.cluster)} target="_blank" rel="noreferrer">View</a></li>)}</ul> : <p className="muted">Trades you make here are listed with their transactions.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Creator({ address }: { address: string }) {
  const { cluster } = useSol();
  const [launched] = useLocal<Launched[]>("launched", []);
  const [sigs, setSigs] = useState<{ sig: string; time: number | null; ok: boolean }[]>([]);
  useEffect(() => { recentSignatures(cluster, address, 10).then(setSigs).catch(() => {}); }, [address, cluster]);
  const mine = launched.filter((l) => l.creator === address);
  return (
    <section className="wrap section" aria-labelledby="cr-title">
      <h1 id="cr-title" className="page-title">Creator <span className="num">{shortKey(address)}</span></h1>
      <p><a href={explorerAccount(address, cluster)} target="_blank" rel="noreferrer">Open on Solscan</a></p>
      <div className="token-grid">
        <div className="card"><h2>Launched from this browser</h2>{mine.length ? <ul className="holders">{mine.map((m) => <li key={m.mint}><a href={`#/token/${m.mint}`}>{m.symbol}</a><span className="muted">{m.cluster}</span></li>)}</ul> : <p className="muted">None recorded here.</p>}</div>
        <div className="card"><h2>Recent transactions</h2>{sigs.length ? <ul className="activity">{sigs.map((s) => <li key={s.sig}><a className="num" href={explorerTx(s.sig, cluster)} target="_blank" rel="noreferrer">{shortKey(s.sig)}</a><span className="muted num">{s.time ? new Date(s.time * 1000).toLocaleDateString() : ""}</span></li>)}</ul> : <p className="muted">No recent transactions on {cluster}.</p>}</div>
      </div>
    </section>
  );
}
