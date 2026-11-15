import { useEffect, useRef, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, useReadContract, useSwitchChain, type Connector } from "wagmi";
import { ETH_CHAIN_ID, IMD_TOKEN } from "../config";
import { formatUnits } from "../lib/economics";
import { ERC20_ABI } from "../lib/imd";
import { SOL_WALLETS, explorerAccount, shortKey, solBalance } from "../lib/solana";
import { useSol } from "../solctx";
import { ETH_WALLETS, chainName, connectorFor, otherConnectors, shortEth, walletOf, type EthWalletId } from "./detect";
import { OPEN_IN, isMobileBrowser } from "./open-in";
import { iconSrc } from "./wallet-icons";

/** The header control: one CONNECT WALLET button for both chains. */
export function WalletButton() {
  const { address: sol, openWallets } = useSol();
  const { address: eth, isConnected } = useAccount();
  const ethAddr = isConnected && eth ? eth : null;
  const count = (ethAddr ? 1 : 0) + (sol ? 1 : 0);
  if (count === 0)
    return <button type="button" className="button button-primary button-small" onClick={() => openWallets("all")}><span>Connect<span className="wallet-word"> wallet</span></span></button>;
  const label = count === 2 ? "2 wallets" : ethAddr ? shortEth(ethAddr) : shortKey(sol!);
  const desc = [ethAddr && `Ethereum ${ethAddr}`, sol && `Solana ${sol}`].filter(Boolean).join(", ");
  return (
    <button type="button" className="button button-small" onClick={() => openWallets("all")} aria-label={`Wallets: ${desc}. Manage or disconnect`}>
      {ethAddr && <span className="chain-dot chain-eth" aria-hidden="true" />}{sol && <span className="chain-dot chain-sol" aria-hidden="true" />}
      <span className="num">{label}</span>
    </button>
  );
}

/** The one wallet sheet: MetaMask and Rabby for Ethereum, Phantom and Solflare for Solana, each connected on its own. */
export function WalletSheet() {
  const { sheet, closeWallets } = useSol();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sheet) return;
    const back = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeWallets(); };
    addEventListener("keydown", k);
    // Modal: the page behind is inert (no focus, no clicks, hidden from screen readers) until the sheet closes.
    const behind = [...(ref.current?.closest(".sheet-bg")?.parentElement?.children ?? [])].filter((el) => !el.classList.contains("sheet-bg")) as HTMLElement[];
    behind.forEach((el) => el.setAttribute("inert", ""));
    ref.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => { removeEventListener("keydown", k); behind.forEach((el) => el.removeAttribute("inert")); back?.focus?.(); };
  }, [sheet]); // eslint-disable-line
  if (!sheet) return null;
  const ethFirst = sheet !== "sol";
  return (
    <div className="sheet-bg" onClick={closeWallets}>
      <div ref={ref} className="sheet sheet-wallets" role="dialog" aria-modal="true" aria-labelledby="wallet-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2 id="wallet-sheet-title">Connect wallet</h2><button type="button" className="x" aria-label="Close" onClick={closeWallets}>×</button></div>
        {ethFirst ? <><EthSection /><SolSection /></> : <><SolSection /><EthSection /></>}
        <p className="hint">You approve every connection and signature in your wallet. The site never asks for a seed phrase or private key.</p>
      </div>
    </div>
  );
}

function EthSection() {
  const mobile = isMobileBrowser();
  const { address, isConnected, chainId, connector: active } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const [err, setErr] = useState("");
  const activeWallet = isConnected ? walletOf(active?.id) : null;

  async function use(c: Connector, name: string) {
    setErr("");
    try {
      // Switching wallets: end the current Ethereum session first, so exactly one account is ever in use.
      if (isConnected && active?.uid !== c.uid) await disconnectAsync();
      await connectAsync({ connector: c });
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(/reject|denied|cancel/i.test(m) ? `You declined in ${name}. Nothing was connected.` : `${name} didn't connect. Unlock it and try again.`);
    }
  }

  const others = otherConnectors(connectors).filter((c) => !mobile || c.type !== "injected");
  const otherName = (c: Connector) => (c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name);
  return (
    <section className="wallet-group" aria-labelledby="eth-group">
      <h3 id="eth-group">Ethereum <span className="muted">· IMD payments, NFTs, rewards</span></h3>
      {isConnected && address && <EthAccount address={address} chainId={chainId} name={active?.name ?? "Wallet"} icon={active?.icon ?? iconSrc(walletOf(active?.id) ?? active?.id ?? "injected") ?? iconSrc("injected")} onDisconnect={() => disconnectAsync().catch(() => {})} />}
      {ETH_WALLETS.map((w) => {
        const c = connectorFor(connectors, w.id);
        const icon = c?.icon ?? iconSrc(w.id);
        if (activeWallet === w.id) return null;
        if (c) {
          const busy = isPending && variables?.connector === c;
          return (
            <button type="button" key={w.id} className="sheet-row" onClick={() => use(c, w.name)} disabled={isPending}>
              <img className="ic" width={28} height={28} src={icon} alt="" />
              <span className="row-name">{isConnected ? `Use ${w.name} instead` : w.name}{busy ? " · opening…" : ""}</span>
              <span className="row-tag">Ethereum</span>
            </button>
          );
        }
        return <MissingRow key={w.id} id={w.id} name={w.name} install={w.install} mobile={mobile} chain="Ethereum" />;
      })}
      {others.length > 0 && (
        <details className="details">
          <summary>Other Ethereum wallets</summary>
          <div className="stack-tight">
            {others.map((c) => (
              <button type="button" key={c.uid} className="sheet-row" onClick={() => use(c, otherName(c))} disabled={isPending || (isConnected && active?.uid === c.uid)}>
                {c.icon ?? iconSrc(c.id) ? <img className="ic" width={28} height={28} src={c.icon ?? iconSrc(c.id)} alt="" /> : <span className="ic" />}
                <span className="row-name">{otherName(c)}{isPending && variables?.connector === c ? " · opening…" : ""}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {err && <p className="hint hint-warn" role="status">{err}</p>}
    </section>
  );
}

function MissingRow({ id, name, install, mobile, chain }: { id: EthWalletId | "phantom" | "solflare"; name: string; install: string; mobile: boolean; chain: string }) {
  const openIn = OPEN_IN.find((o) => o.id === id);
  const sol = SOL_WALLETS.find((w) => w.id === id);
  const href = mobile ? (openIn?.href(location.href) ?? sol?.browse(location.href) ?? install) : install;
  return (
    <a className="sheet-row" href={href} target={mobile ? undefined : "_blank"} rel="noreferrer">
      <img className="ic" width={28} height={28} src={iconSrc(id)} alt="" />
      <span className="row-name">{mobile ? `Open in ${name}` : `Install ${name}`}</span>
      <span className="row-tag">{chain}</span>
    </a>
  );
}

function EthAccount({ address, chainId, name, icon, onDisconnect }: { address: `0x${string}`; chainId?: number; name: string; icon?: string; onDisconnect: () => void }) {
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [err, setErr] = useState("");
  const right = chainId === ETH_CHAIN_ID;
  const eth = useBalance({ address, chainId: ETH_CHAIN_ID });
  const imd = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: [address], chainId: ETH_CHAIN_ID });
  const checksum = getAddress(address);
  async function toMainnet() {
    setErr("");
    try { await switchChainAsync({ chainId: ETH_CHAIN_ID }); }
    catch { setErr("The wallet kept its network. Approve the switch to Ethereum Mainnet in the wallet."); }
  }
  return (
    <div className="account" aria-label={`${name} connected`}>
      <div className="account-head">
        <img className="ic" width={28} height={28} src={icon} alt="" />
        <strong>{name}</strong>
        <span className={`pill ${right ? "state-completed" : "state-blocked"}`}>{right ? "Ethereum Mainnet" : `Wrong network: ${chainName(chainId)}`}</span>
      </div>
      <p className="mono-wrap num" title="Ethereum address">{checksum}</p>
      <dl className="facts">
        <div><dt>ETH</dt><dd className="num">{eth.data ? formatUnits(eth.data.value, 18, 5) : eth.isError ? "Unavailable" : "…"}</dd></div>
        <div><dt>IMD</dt><dd className="num">{imd.data != null ? formatUnits(imd.data, 18) : imd.isError ? "Unavailable" : "…"}</dd></div>
      </dl>
      <div className="actions">
        {!right && <button type="button" className="button button-primary button-small" onClick={toMainnet} disabled={switching}>{switching ? "Switching…" : "Switch to Ethereum Mainnet"}</button>}
        <button type="button" className="button button-small" onClick={() => navigator.clipboard?.writeText(checksum).catch(() => {})}>Copy address</button>
        <button type="button" className="button button-small button-quiet" onClick={onDisconnect}>Disconnect {name}</button>
      </div>
      {err && <p className="hint hint-warn" role="status">{err}</p>}
    </div>
  );
}

function SolSection() {
  const { address, walletName, walletId, cluster, connectSol, disconnect, pending, err } = useSol();
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [bal, setBal] = useState<bigint | null | "error">(null);
  useEffect(() => {
    setBal(null);
    if (!address) return;
    let alive = true;
    solBalance(cluster, address).then((b) => alive && setBal(b)).catch(() => alive && setBal("error"));
    return () => { alive = false; };
  }, [address, cluster]);
  return (
    <section className="wallet-group" aria-labelledby="sol-group">
      <h3 id="sol-group">Solana <span className="muted">· launches, trading, PIMD</span></h3>
      {address && (
        <div className="account" aria-label={`${walletName} connected`}>
          <div className="account-head">
            <img className="ic" width={28} height={28} src={iconSrc(walletId ?? "phantom")} alt="" />
            <strong>{walletName}</strong>
            <span className={`pill ${cluster === "mainnet" ? "state-executing" : "state-completed"}`}>{cluster === "mainnet" ? "Solana Mainnet" : "Solana Devnet"}</span>
          </div>
          <p className="mono-wrap num" title="Solana address"><a href={explorerAccount(address, cluster)} target="_blank" rel="noreferrer">{address}</a></p>
          <dl className="facts"><div><dt>SOL</dt><dd className="num">{bal === "error" ? "Unavailable" : bal == null ? "…" : formatUnits(bal, 9, 4)}</dd></div></dl>
          <div className="actions">
            <button type="button" className="button button-small" onClick={() => navigator.clipboard?.writeText(address).catch(() => {})}>Copy address</button>
            <button type="button" className="button button-small button-quiet" onClick={disconnect}>Disconnect {walletName}</button>
          </div>
        </div>
      )}
      {SOL_WALLETS.filter((w) => w.id !== walletId || !address).map((w) => {
        if (w.provider()) return (
          <button type="button" key={w.id} className="sheet-row" onClick={() => connectSol(w.id)} disabled={!!pending}>
            <img className="ic" width={28} height={28} src={iconSrc(w.id)} alt="" />
            <span className="row-name">{address ? `Use ${w.name} instead` : w.name}{pending === w.id ? " · opening…" : ""}</span>
            <span className="row-tag">Solana</span>
          </button>
        );
        return <MissingRow key={w.id} id={w.id} name={w.name} install={w.install} mobile={mobile} chain="Solana" />;
      })}
      {err && <p className="hint hint-warn" role="status">{err}</p>}
    </section>
  );
}
