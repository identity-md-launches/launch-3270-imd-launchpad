import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { ETH_CHAIN_ID } from "../config";
import { iconSrc } from "./wallet-icons";
import { OPEN_IN, isMobileBrowser } from "./open-in";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The Ethereum connect control (IMD payments and rewards): EIP-6963 extensions, open-in links on phones, Coinbase Smart Wallet. */
export function ConnectSheet({ label = "Connect Ethereum wallet" }: { label?: string }) {
  const mobile = isMobileBrowser();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, variables, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => { if (isConnected) setOpen(false); }, [isConnected]);

  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")]
    .filter((c) => !(c.id === "injected" && named));
  const name = (c: Connector) => (c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name);
  const icon = (c: Connector) => c.icon ?? iconSrc(c.id);

  if (isConnected && address) {
    if (chainId !== ETH_CHAIN_ID)
      return <button type="button" className="button button-primary" disabled={switching} onClick={() => switchChain({ chainId: ETH_CHAIN_ID })}>Switch to Ethereum</button>;
    return <button type="button" className="button" onClick={() => disconnect()}><span className="num">{short(address)}</span> · Disconnect</button>;
  }
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => { reset(); setOpen(true); }}>{label}</button>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="eth-sheet-title" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><h2 id="eth-sheet-title">Connect a wallet</h2><button type="button" className="x" aria-label="Close" onClick={() => setOpen(false)}>×</button></div>
            {mobile && OPEN_IN.map((w) => (
              <a key={w.id} className="sheet-row" href={w.href(location.href)}>
                <img className="ic" width={28} height={28} src={iconSrc(w.id)} alt="" />
                <span>Open in {w.name}</span>
              </a>
            ))}
            {listed.filter((c) => !mobile || c.type !== "injected").map((c) => (
              <button type="button" key={c.uid} className="sheet-row" onClick={() => connect({ connector: c })} disabled={isPending}>
                {icon(c) ? <img className="ic" width={28} height={28} src={icon(c)} alt="" /> : <span className="ic" />}
                <span>{name(c)}{isPending && variables?.connector === c ? " · opening…" : ""}</span>
              </button>
            ))}
            {error && <p className="hint hint-warn" role="status">The wallet didn't connect. Try again or pick another.</p>}
          </div>
        </div>
      )}
    </>
  );
}
