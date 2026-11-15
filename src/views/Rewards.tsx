import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { DEAD_ADDRESS, ETH_CHAIN_ID, IMD_NFT_COLLECTION, IMD_TOKEN, OWNER } from "../config";
import { formatUnits, REVENUE_SPLIT, splitAmount } from "../lib/economics";
import { ERC20_ABI, ERC721_ABI, fetchSwarm, type SwarmStats } from "../lib/imd";
import { ConnectSheet } from "../wallet/ConnectSheet";
import { useEffect } from "react";

export function Rewards() {
  return (
    <section className="wrap section" aria-labelledby="rw-title">
      <h1 id="rw-title" className="page-title">Revenue, burns and workers</h1>
      <p className="lede">Where platform revenue goes, and how IMD NFT workers earn.</p>
      <div className="token-grid">
        <div className="stack"><RevenueSplit /><Workers /></div>
        <div className="stack"><BurnBoard /><Governance /></div>
      </div>
    </section>
  );
}

function RevenueSplit() {
  const [usd, setUsd] = useState("10000");
  const cents = BigInt(Math.max(0, Math.round(Number(usd || 0) * 100)) || 0);
  const parts = splitAmount(cents, REVENUE_SPLIT);
  return (
    <div className="card">
      <h2>Revenue split</h2>
      <div className="field"><label htmlFor="rev">Eligible net platform revenue (USD)</label><input id="rev" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value.replace(/[^\d.]/g, ""))} /></div>
      <ul className="split-list">
        {REVENUE_SPLIT.map((s, i) => (
          <li key={s.id}><span className={`dot bar-${i}`} aria-hidden="true" /><span><strong>{s.label}</strong><span className="muted">{s.note}</span></span><span className="num">{s.bps / 100}% · ${formatUnits(parts[i].amount, 2, 2)}</span></li>
        ))}
      </ul>
      <p className="hint">Revenue means launch fees, paid AI tools and subscriptions. Customer deposits and trading volume are never counted.</p>
    </div>
  );
}

function BurnBoard() {
  const supply = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "totalSupply", chainId: ETH_CHAIN_ID });
  const dead = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: [DEAD_ADDRESS], chainId: ETH_CHAIN_ID });
  const dev = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: OWNER.developerImdWallet ? [OWNER.developerImdWallet] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!OWNER.developerImdWallet } });
  return (
    <div className="card">
      <h2>IMD burn and treasury</h2>
      <dl className="facts">
        <div><dt>IMD supply now</dt><dd className="num">{supply.data != null ? formatUnits(supply.data, 18, 0) : supply.isError ? "Unavailable" : "Loading…"}</dd></div>
        <div><dt>Held by the dead address</dt><dd className="num">{dead.data != null ? formatUnits(dead.data, 18, 0) : dead.isError ? "Unavailable" : "Loading…"}</dd></div>
        <div><dt>Ecosystem multisig</dt><dd>{OWNER.treasuryMultisig ? <a className="num" href={`https://etherscan.io/address/${OWNER.treasuryMultisig}`}>{OWNER.treasuryMultisig.slice(0, 10)}…</a> : "Not set up yet"}</dd></div>
        <div><dt>Developer IMD wallet</dt><dd>{OWNER.developerImdWallet ? <><a className="num" href={`https://etherscan.io/address/${OWNER.developerImdWallet}`}>{OWNER.developerImdWallet.slice(0, 10)}…</a>{dev.data != null && <span className="num"> · {formatUnits(dev.data, 18, 2)} IMD</span>}</> : "Waiting for the developer to disclose it"}</dd></div>
      </dl>
      <p className="hint">Read live from Ethereum. Buybacks run from the multisig with at most 1% slippage, and each burn is listed with its transaction once the treasury is live.</p>
    </div>
  );
}

function Workers() {
  const { address } = useAccount();
  const [tokenId, setTokenId] = useState("");
  const [swarm, setSwarm] = useState<SwarmStats | null>(null);
  useEffect(() => { fetchSwarm().then(setSwarm).catch(() => {}); }, []);
  const imd = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const held = useReadContract({ address: IMD_NFT_COLLECTION, abi: ERC721_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const idOk = /^\d{1,5}$/.test(tokenId);
  const owner = useReadContract({ address: IMD_NFT_COLLECTION, abi: ERC721_ABI, functionName: "ownerOf", args: idOk ? [BigInt(tokenId)] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: idOk } });
  const seat = idOk ? swarm?.seats[tokenId] : undefined;
  const mine = !!address && owner.data?.toLowerCase() === address.toLowerCase();
  const top = swarm ? Object.values(swarm.seats).sort((a, b) => b.accepted - a.accepted).slice(0, 5) : [];
  return (
    <div className="card">
      <h2>IMD NFT workers</h2>
      <p className="muted">Each identity.md NFT is one Swarm seat. Its holder's agent takes jobs and is paid in IMD for accepted work.</p>
      <div className="actions">{address ? <span className="hint num">This wallet holds {held.data != null ? held.data.toString() : "…"} IMD NFT{held.data === 1n ? "" : "s"} and {imd.data != null ? formatUnits(imd.data, 18) : "…"} IMD{held.data != null ? (held.data > 0n ? ". Verified: it can run a Swarm seat and earn IMD." : ". It needs an IMD NFT to earn worker rewards.") : ""}</span> : <ConnectSheet label="Connect to verify" />}</div>
      <div className="field"><label htmlFor="seat">Seat number</label><input id="seat" inputMode="numeric" value={tokenId} onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 2" /></div>
      {idOk && (
        <dl className="facts">
          <div><dt>Owner</dt><dd className="num">{owner.data ? `${owner.data.slice(0, 6)}…${owner.data.slice(-4)}${mine ? " (you)" : ""}` : owner.isError ? "Not minted" : "…"}</dd></div>
          <div><dt>Accepted work</dt><dd className="num">{seat ? `${seat.accepted} of ${seat.attempts}` : "Not enrolled"}</dd></div>
          <div><dt>Acceptance rate</dt><dd className="num">{seat && seat.attempts ? `${((seat.accepted / seat.attempts) * 100).toFixed(1)}%` : "–"}</dd></div>
          <div><dt>Last active</dt><dd className="num">{seat ? new Date(seat.last).toLocaleDateString() : "–"}</dd></div>
        </dl>
      )}
      {top.length > 0 && (
        <>
          <h3>Most accepted work</h3>
          <ol className="holders">{top.map((s) => <li key={s.tokenId}><span>Seat {s.tokenId}</span><span className="num">{s.accepted.toLocaleString()} accepted</span></li>)}</ol>
        </>
      )}
      <p className="hint">Run a worker with the IMD Worker app: <a href="https://imd.fun/seats/" target="_blank" rel="noreferrer">imd.fun/seats</a>.</p>
    </div>
  );
}

function Governance() {
  return (
    <div className="card">
      <h2>Governance and takeovers</h2>
      <ul className="bullets">
        <li>PIMD holders vote on treasury spending, reward rates and Swarm discounts once PIMD is approved and live.</li>
        <li>A community takeover of an abandoned project needs a public proposal, a 7-day vote and a multisig handover. No key ever changes hands.</li>
        <li>Creator and holder fee shares follow what LaunchLab supports for each pool.</li>
        <li>Airdrops and X or Telegram campaigns are drafted by Swarm and sent only after the project owner approves them.</li>
      </ul>
    </div>
  );
}
