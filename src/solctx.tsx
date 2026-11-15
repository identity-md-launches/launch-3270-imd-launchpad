import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_CLUSTER, type SolanaCluster } from "./config";
import { SOL_WALLETS, shortKey, type SolProvider, type SolWallet } from "./lib/solana";
import { readLocal, writeLocal } from "./lib/store";

export type SheetFocus = "all" | "eth" | "sol";
type Ctx = {
  cluster: SolanaCluster; setCluster: (c: SolanaCluster) => void;
  address: string | null; provider: SolProvider | null; walletName: string | null; walletId: SolWallet["id"] | null;
  /** Opens the shared wallet sheet with the Solana group first (kept for the launch, trade and portfolio views). */
  openConnect: () => void;
  openWallets: (focus?: SheetFocus) => void; closeWallets: () => void; sheet: SheetFocus | null;
  connectSol: (id: SolWallet["id"]) => Promise<void>; disconnect: () => void; pending: string | null; err: string;
};
const SolCtx = createContext<Ctx>(null as unknown as Ctx);
export const useSol = () => useContext(SolCtx);

/**
 * Solana wallet state (Phantom, Solflare). It is separate from the Ethereum state in wagmi, so a
 * visitor can hold one wallet of each at once and neither replaces the other.
 */
export function SolanaProvider({ children }: { children: ReactNode }) {
  const [cluster, setClusterState] = useState<SolanaCluster>(() => readLocal("cluster", DEFAULT_CLUSTER));
  const [wallet, setWallet] = useState<SolWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetFocus | null>(null);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const setCluster = (c: SolanaCluster) => { setClusterState(c); writeLocal("cluster", c); };

  // Reconnect silently only to the wallet the visitor chose last, and only if it already trusts the site.
  useEffect(() => {
    const last = readLocal<string | null>("solwallet", null);
    const w = SOL_WALLETS.find((x) => x.id === last);
    const p = w?.provider();
    if (w && p) p.connect({ onlyIfTrusted: true }).then(() => { if (p.publicKey) { setWallet(w); setAddress(p.publicKey.toBase58()); } }).catch(() => {});
  }, []);

  async function connectSol(id: SolWallet["id"]) {
    const w = SOL_WALLETS.find((x) => x.id === id);
    const p = w?.provider();
    if (!w || !p) return;
    setErr(""); setPending(w.id);
    try {
      if (wallet && wallet.id !== w.id) await wallet.provider()?.disconnect().catch(() => {});
      await p.connect();
      if (!p.publicKey) throw new Error("no key");
      setWallet(w); setAddress(p.publicKey.toBase58()); writeLocal("solwallet", w.id);
      p.on?.("accountChanged", () => setAddress(p.publicKey?.toBase58() ?? null));
    } catch { setErr(`${w.name} didn't connect. Approve the request in the wallet, or pick another.`); }
    finally { setPending(null); }
  }
  const disconnect = () => { wallet?.provider()?.disconnect().catch(() => {}); setWallet(null); setAddress(null); writeLocal("solwallet", null); };
  const openWallets = (focus: SheetFocus = "all") => { setErr(""); setSheet(focus); };

  return (
    <SolCtx.Provider value={{ cluster, setCluster, address, provider: wallet?.provider() ?? null, walletName: wallet?.name ?? null, walletId: wallet?.id ?? null,
      openConnect: () => openWallets("sol"), openWallets, closeWallets: () => setSheet(null), sheet, connectSol, disconnect, pending, err }}>
      {children}
    </SolCtx.Provider>
  );
}

/** A Solana-only control used inside the launch and trade forms. */
export function SolConnectButton({ compact }: { compact?: boolean }) {
  const { address, openConnect } = useSol();
  if (address) return <button type="button" className={`button ${compact ? "button-small" : ""}`} onClick={openConnect}><span className="num">{shortKey(address)}</span><span className="visually-hidden"> Solana wallet, manage</span></button>;
  return <button type="button" className={`button button-primary ${compact ? "button-small" : ""}`} onClick={openConnect}>Connect Solana wallet</button>;
}
