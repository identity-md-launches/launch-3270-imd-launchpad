import { useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { ETH_CHAIN_ID } from "../config";
import { useSol } from "../solctx";
import { shortEth } from "./detect";

/**
 * The Ethereum control inside the Swarm and Rewards views. Not connected, it opens the shared wallet
 * sheet with MetaMask and Rabby first. On another network it offers the switch to Ethereum Mainnet
 * (wallet_switchEthereumChain, sent by wagmi) and nothing else, so no transaction can start there.
 */
export function ConnectSheet({ label = "Connect MetaMask or Rabby" }: { label?: string }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openWallets } = useSol();
  const [err, setErr] = useState("");

  if (isConnected && address) {
    if (chainId !== ETH_CHAIN_ID)
      return (
        <>
          <button type="button" className="button button-primary" disabled={switching} onClick={() => { setErr(""); switchChainAsync({ chainId: ETH_CHAIN_ID }).catch(() => setErr("The wallet kept its network. Approve the switch in the wallet.")); }}>
            {switching ? "Switching…" : "Switch to Ethereum Mainnet"}
          </button>
          {err && <span className="hint hint-warn" role="status">{err}</span>}
        </>
      );
    return <button type="button" className="button" onClick={() => disconnect()}><span className="num">{shortEth(address)}</span> · Disconnect {connector?.name ?? ""}</button>;
  }
  return <button type="button" className="button button-primary" onClick={() => openWallets("eth")}>{label}</button>;
}
