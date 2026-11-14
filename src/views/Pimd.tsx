import { OWNER } from "../config";
import { MAX_RESERVE_BPS, PIMD, PIMD_SPLIT, reserveBps } from "../lib/economics";

const USES = ["Swarm discounts", "Premium features", "Airdrops", "Marketing", "Creator benefits", "Community rewards", "Governance"];

export function Pimd() {
  const reserve = reserveBps(PIMD_SPLIT);
  return (
    <section className="wrap section" aria-labelledby="pimd-title">
      <h1 id="pimd-title" className="page-title">Pump IMD (PIMD)</h1>
      <p className="lede">The launchpad's own Solana token. A proposal: it is not deployed.</p>
      <div className="token-grid">
        <div className="stack">
          <div className="card">
            <h2>Proposed distribution</h2>
            <div className="bar" role="img" aria-label={PIMD_SPLIT.map((s) => `${s.label} ${s.bps / 100}%`).join(", ")}>
              {PIMD_SPLIT.map((s, i) => <span key={s.id} className={`bar-${i}`} style={{ inlineSize: `${s.bps / 100}%` }} />)}
            </div>
            <ul className="split-list">
              {PIMD_SPLIT.map((s, i) => (
                <li key={s.id}><span className={`dot bar-${i}`} aria-hidden="true" /><span><strong>{s.label}</strong><span className="muted">{s.note}</span></span><span className="num">{(s.bps / 100).toFixed(0)}% · {((PIMD.supply * s.bps) / 10000).toLocaleString()}</span></li>
              ))}
            </ul>
            <p className="hint num">Reserves: {reserve / 100}% of supply, within the {MAX_RESERVE_BPS / 100}% cap. Each reserve sits in a multisig with a timelock and on-chain vesting.</p>
          </div>
          <div className="card">
            <h2>Launch protocol check</h2>
            <ul className="bullets">
              <li>Raydium LaunchLab supports a 1,000,000,000 supply with 6 decimals, the PIMD plan.</li>
              <li>LaunchLab's locked, vesting allocation (totalLockedAmount, cliff and unlock period) holds reserves on-chain without a hidden mint.</li>
              <li>The standard curve sells about 79% of supply. A 30% public share needs a custom platform config, set up and tested on Devnet first.</li>
              <li>Mint and freeze authority are revoked at creation. No wallet keeps a hidden privilege.</li>
            </ul>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <dl className="facts">
              <div><dt>Name</dt><dd>{PIMD.name}</dd></div>
              <div><dt>Ticker</dt><dd>{PIMD.symbol}</dd></div>
              <div><dt>Supply</dt><dd className="num">{PIMD.supply.toLocaleString()}</dd></div>
              <div><dt>Chain</dt><dd>Solana. Separate from Ethereum IMD.</dd></div>
              <div><dt>Status</dt><dd>{OWNER.pimdApproved ? "Approved for Devnet testing" : "Awaiting the owner's approval"}</dd></div>
            </dl>
          </div>
          <div className="card">
            <h2>What PIMD is for</h2>
            <ul className="chips">{USES.map((u) => <li key={u}>{u}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}
