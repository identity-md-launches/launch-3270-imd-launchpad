import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_CLUSTER, type SolanaCluster } from "./config";
import { SOL_WALLETS, shortKey, type SolProvider, type SolWallet } from "./lib/solana";
import { readLocal, writeLocal } from "./lib/store";
import { iconSrc } from "./wallet/wallet-icons";

type Ctx = { cluster: SolanaCluster; setCluster: (c: SolanaCluster) => void; address: string | null; provider: SolProvider | null; walletName: string | null; openConnect: () => void; disconnect: () => void };
const SolCtx = createContext<Ctx>(null as unknown as Ctx);
export const useSol = () => useContext(SolCtx);

export function SolanaProvider({ children }: { children: ReactNode }) {
  const [cluster, setClusterState] = useState<SolanaCluster>(() => readLocal("cluster", DEFAULT_CLUSTER));
  const [wallet, setWallet] = useState<SolWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const setCluster = (c: SolanaCluster) => { setClusterState(c); writeLocal("cluster", c); };

  // Reconnect silently to a wallet the visitor already trusted.
  useEffect(() => {
    const last = readLocal<string | null>("solwallet", null);
    const w = SOL_WALLETS.find((x) => x.id === last);
    const p = w?.provider();
    if (w && p) p.connect({ onlyIfTrusted: true }).then(() => { if (p.publicKey) { setWallet(w); setAddress(p.publicKey.toBase58()); } }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [open]);

  async function connect(w: SolWallet) {
    const p = w.provider();
    if (!p) return;
    setErr(""); setPending(w.id);
    try {
      await p.connect();
      if (!p.publicKey) throw new Error("no key");
      setWallet(w); setAddress(p.publicKey.toBase58()); writeLocal("solwallet", w.id); setOpen(false);
      p.on?.("accountChanged", () => setAddress(p.publicKey?.toBase58() ?? null));
    } catch { setErr(`${w.name} didn't connect. Approve the request in the wallet, or pick another.`); }
    finally { setPending(null); }
  }
  const disconnect = () => { wallet?.provider()?.disconnect().catch(() => {}); setWallet(null); setAddress(null); writeLocal("solwallet", null); };
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <SolCtx.Provider value={{ cluster, setCluster, address, provider: wallet?.provider() ?? null, walletName: wallet?.name ?? null, openConnect: () => setOpen(true), disconnect }}>
      {children}
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sol-sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><h2 id="sol-sheet-title">Connect a Solana wallet</h2><button type="button" className="x" aria-label="Close" onClick={() => setOpen(false)}>×</button></div>
            {SOL_WALLETS.map((w) => {
              const has = !!w.provider();
              if (has) return (
                <button type="button" key={w.id} className="sheet-row" onClick={() => connect(w)} disabled={!!pending}>
                  <img className="ic" width={28} height={28} src={iconSrc(w.id)} alt="" /><span>{w.name}{pending === w.id ? " · opening…" : ""}</span>
                </button>
              );
              return (
                <a key={w.id} className="sheet-row" href={mobile ? w.browse(location.href) : w.install} target={mobile ? undefined : "_blank"} rel="noreferrer">
                  <img className="ic" width={28} height={28} src={iconSrc(w.id)} alt="" /><span>{mobile ? `Open in ${w.name}` : `Install ${w.name}`}</span>
                </a>
              );
            })}
            {err && <p className="hint hint-warn" role="status">{err}</p>}
            <p className="hint">You sign every transaction in your wallet. The site never sees your keys.</p>
          </div>
        </div>
      )}
    </SolCtx.Provider>
  );
}

export function SolConnectButton({ compact }: { compact?: boolean }) {
  const { address, openConnect, disconnect } = useSol();
  if (address) return <button type="button" className={`button ${compact ? "button-small" : ""}`} onClick={disconnect} title="Disconnect"><span className="num">{shortKey(address)}</span><span className="visually-hidden"> Disconnect</span></button>;
  return <button type="button" className={`button button-primary ${compact ? "button-small" : ""}`} onClick={openConnect}>Connect</button>;
}
