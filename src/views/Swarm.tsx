import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ETH_CHAIN_ID, IMD_EXPLORER, IMD_INTAKE, IMD_PAY_TO, IMD_TOKEN, SWARM_FEE_WEI } from "../config";
import { buildSwarmBody, formatUnits, SWARM_KINDS, type SwarmKind } from "../lib/economics";
import { actionId, encodeBody, ERC20_ABI, fetchIntake, fetchJob, fetchJobResult, fetchSwarm, INTAKE_ABI, isTerminal, jobIdFromIntake, NO_CALLBACK, type Job, type JobResult, type SwarmStats } from "../lib/imd";
import { notify, useLocal, type SwarmOrder } from "../lib/store";
import { ConnectSheet } from "../wallet/ConnectSheet";

const qs = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const etherscanTx = (h: string) => `https://etherscan.io/tx/${h}`;

export function Swarm() {
  const [orders] = useLocal<SwarmOrder[]>("swarm-orders", []);
  return (
    <section className="wrap section" aria-labelledby="sw-title">
      <h1 id="sw-title" className="page-title">Build with Swarm</h1>
      <p className="lede">IMD's AI workers build your website, brand, game, app or launch posts for 0.5 IMD a request.</p>
      <div className="token-grid">
        <div className="stack"><BuildForm />{orders.map((o) => <JobTracker key={o.tx} order={o} />)}<TrackById /></div>
        <div className="stack"><SwarmLive /><FeeFacts /></div>
      </div>
    </section>
  );
}

function FeeFacts() {
  return (
    <div className="card">
      <h2>Payment</h2>
      <dl className="facts">
        <div><dt>Price</dt><dd className="num">0.5 IMD per request, plus Ethereum gas</dd></div>
        <div><dt>Paid to</dt><dd>IMD Intakev2 <a className="num" href={`https://etherscan.io/address/${IMD_INTAKE}`} target="_blank" rel="noreferrer">{IMD_INTAKE.slice(0, 10)}…</a></dd></div>
        <div><dt>Token</dt><dd>IMD <a className="num" href={`https://etherscan.io/token/${IMD_TOKEN}`} target="_blank" rel="noreferrer">{IMD_TOKEN.slice(0, 10)}…</a></dd></div>
        <div><dt>Forwarded to</dt><dd>IMD treasury <span className="num">{IMD_PAY_TO.slice(0, 10)}…</span></dd></div>
      </dl>
      <p className="hint">Payment admits the job. It doesn't guarantee a result, and there are no refunds.</p>
    </div>
  );
}

function SwarmLive() {
  const [s, setS] = useState<SwarmStats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let a = true; const t = () => fetchSwarm().then((x) => a && setS(x)).catch(() => a && setErr(true)); t(); const id = setInterval(t, 30000); return () => { a = false; clearInterval(id); }; }, []);
  return (
    <div className="card">
      <h2>Swarm right now</h2>
      {err && !s ? <p className="muted">The Swarm API didn't answer. Try again shortly.</p> : !s ? <p className="muted">Loading live figures…</p> : (
        <dl className="stats">
          <div><dt>Agents online</dt><dd className="num">{s.health.agentsOnline.toLocaleString()}</dd></div>
          <div><dt>Seats enrolled</dt><dd className="num">{s.health.seatsEnrolled.toLocaleString()}</dd></div>
          <div><dt>Jobs done today</dt><dd className="num">{s.health.jobsDoneLastDay.toLocaleString()}</dd></div>
          <div><dt>Sites shipped</dt><dd className="num">{s.counts.sites.toLocaleString()}</dd></div>
        </dl>
      )}
      <p className="hint">From api.imd.fun, refreshed every 30 seconds.</p>
    </div>
  );
}

type Step = "idle" | "approving" | "paying" | "done";
function BuildForm() {
  const p = qs();
  const [kind, setKind] = useState<SwarmKind>("project");
  const [idea, setIdea] = useState("");
  const [token, setToken] = useState({ name: p.get("name") ?? "", symbol: p.get("symbol") ?? "", mint: p.get("mint") ?? "" });
  const [parent, setParent] = useState(p.get("parent") ?? "");
  // The view stays mounted when only the query changes (e.g. "Build the next version"), so re-read it.
  useEffect(() => {
    const on = () => {
      const q = qs();
      setParent(q.get("parent") ?? "");
      setToken({ name: q.get("name") ?? "", symbol: q.get("symbol") ?? "", mint: q.get("mint") ?? "" });
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const [step, setStep] = useState<Step>("idle");
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: ETH_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [, setOrders] = useLocal<SwarmOrder[]>("swarm-orders", []);
  const bal = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const allow = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, IMD_INTAKE] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const body: Record<string, string> = { ...buildSwarmBody(kind, idea || "Describe the project.", token.name ? token : undefined), ...(parent ? { parentJobId: parent } : {}) };
  const enough = (bal.data ?? 0n) >= SWARM_FEE_WEI;
  const approved = (allow.data ?? 0n) >= SWARM_FEE_WEI;
  const wrongChain = !!address && chainId !== ETH_CHAIN_ID;

  async function pay() {
    setErr("");
    if (idea.trim().length < 20) return setErr("Describe the project in at least one full sentence.");
    if (!confirm) return setErr("Confirm the brief and the 0.5 IMD payment first.");
    if (!client) return;
    try {
      if (!approved) {
        setStep("approving");
        const h = await writeContractAsync({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "approve", args: [IMD_INTAKE, SWARM_FEE_WEI], chainId: ETH_CHAIN_ID });
        await client.waitForTransactionReceipt({ hash: h });
        await allow.refetch();
      }
      setStep("paying");
      const action = parent ? "job.continue" : "job.open";
      const tx = await writeContractAsync({ address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "request", args: [actionId(action), encodeBody(body), NO_CALLBACK, IMD_TOKEN, SWARM_FEE_WEI], chainId: ETH_CHAIN_ID });
      const rc = await client.waitForTransactionReceipt({ hash: tx });
      if (rc.status !== "success") throw new Error("the payment transaction reverted");
      setOrders((o) => [{ tx, kind, objective: body.objective, at: Date.now() }, ...o]);
      notify("Swarm payment confirmed. Waiting for the job to be admitted.", etherscanTx(tx));
      setStep("done"); bal.refetch(); allow.refetch();
    } catch (e) {
      const m = e instanceof Error ? e.message.split("\n")[0] : String(e);
      setErr(/reject|denied/i.test(m) ? "You declined in your wallet. Nothing was paid." : `Payment didn't complete: ${m}`);
      setStep("idle");
    }
  }

  return (
    <div className="card">
      <h2>Your brief</h2>
      {token.name && <p className="hint">For {token.name} ({token.symbol.toUpperCase()}).</p>}
      <fieldset className="field">
        <legend>What should the Swarm build?</legend>
        <div className="choice-grid">
          {SWARM_KINDS.map((k) => (
            <label key={k.id} className="choice"><input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} /><span><strong>{k.label}</strong><span className="muted">{k.hint}</span></span></label>
          ))}
        </div>
      </fieldset>
      <div className="field"><label htmlFor="sw-idea">Describe the project</label><textarea id="sw-idea" rows={4} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="A cat-themed community token for harbour towns, playful and warm, with a site that explains how to buy." /></div>
      <div className="field"><label htmlFor="sw-parent">Continue an earlier job (optional)</label><input id="sw-parent" value={parent} onChange={(e) => setParent(e.target.value.trim())} placeholder="Job ID of the version to build on" autoComplete="off" /></div>
      <details className="details"><summary>See the exact request</summary><pre className="code">{JSON.stringify({ action: parent ? "job.continue@job-1" : "job.open@job-1", body }, null, 2)}</pre></details>
      <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I've checked the brief. Pay 0.5 IMD on Ethereum to start it.</label>
      {address && !wrongChain && (
        <p className="hint num">Balance: {bal.data != null ? formatUnits(bal.data, 18) : "…"} IMD · {approved ? "Approved for 0.5 IMD" : "Needs a 0.5 IMD approval first"}</p>
      )}
      {address && !wrongChain && bal.data != null && !enough && <p className="error">This wallet holds less than 0.5 IMD.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {step === "done" && <p className="hint" role="status">Paid. Your job appears below as soon as the network admits it.</p>}
      <div className="actions">
        {!address || wrongChain ? <ConnectSheet /> : (
          <button type="button" className="button button-primary" onClick={pay} disabled={step === "approving" || step === "paying" || !enough}>
            {step === "approving" ? "Approving 0.5 IMD…" : step === "paying" ? "Paying and sending…" : approved ? "Pay 0.5 IMD and start" : "Approve, then pay 0.5 IMD"}
          </button>
        )}
      </div>
      <p className="hint">Two signatures at most: an exact 0.5 IMD approval, then the request. The brief is public, so keep secrets out of it.</p>
    </div>
  );
}

function TrackById() {
  const [id, setId] = useState("");
  const [, setOrders] = useLocal<SwarmOrder[]>("swarm-orders", []);
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); const v = id.trim(); if (!v) return; setOrders((o) => [{ tx: v.startsWith("0x") ? v : `job:${v}`, jobId: v.startsWith("0x") ? undefined : v, kind: "tracked", objective: "", at: Date.now() }, ...o]); setId(""); }}>
      <div className="field"><label htmlFor="track">Follow a job or payment</label><input id="track" value={id} onChange={(e) => setId(e.target.value)} placeholder="Job ID or Ethereum transaction hash" /></div>
      <button type="submit" className="button button-small">Follow</button>
    </form>
  );
}

function JobTracker({ order }: { order: SwarmOrder }) {
  const [jobId, setJobId] = useState<string | null>(order.jobId ?? null);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [note, setNote] = useState("Waiting for the network to see the payment…");
  const [, setOrders] = useLocal<SwarmOrder[]>("swarm-orders", []);
  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        let id = jobId;
        if (!id && order.tx.startsWith("0x")) {
          const r = await fetchIntake(ETH_CHAIN_ID, order.tx);
          const entry = r?.entries?.[0];
          if (entry?.state === "refused") { setNote(`The network refused the request: ${entry.reason ?? "no reason given"}.`); return; }
          id = jobIdFromIntake(r);
          if (id && alive) { setJobId(id); setOrders((list) => list.map((o) => (o.tx === order.tx ? { ...o, jobId: id! } : o))); }
        }
        if (id) {
          const j = await fetchJob(id);
          if (!alive) return;
          setJob(j);
          if (j && isTerminal(j.state)) {
            if (j.state === "completed") { setResult(await fetchJobResult(id)); notify("Your Swarm job is complete.", `${IMD_EXPLORER}/jobs/${id}`); }
            return;
          }
        }
      } catch { setNote("The Swarm API didn't answer. Retrying…"); }
      if (alive) timer = setTimeout(poll, 10000);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [order.tx, jobId]); // eslint-disable-line

  const nodes = job?.nodes ?? [];
  return (
    <div className="card" aria-live="polite">
      <div className="field-head"><h2>{order.kind === "tracked" ? "Followed job" : SWARM_KINDS.find((k) => k.id === order.kind)?.label ?? "Swarm job"}</h2>{job && <span className={`pill state-${job.state}`}>{job.state}</span>}</div>
      {order.objective && <p className="muted clamp">{order.objective}</p>}
      {!job && <p className="hint">{note}</p>}
      {nodes.length > 0 && <ol className="job-steps">{nodes.map((n, i) => <li key={n.id ?? i}><span>{n.title ?? n.skill ?? `Step ${i + 1}`}</span><span className="muted">{n.state ?? ""}</span></li>)}</ol>}
      {job?.state === "blocked" && <p className="error">Blocked: {job.blockedReason ?? "see the explorer for details"}.</p>}
      {result?.files?.length ? <ul className="link-list">{result.files.map((f) => <li key={f.path}><a href={f.url} target="_blank" rel="noreferrer">{f.name || f.path}</a></li>)}</ul> : null}
      <div className="actions">
        {order.tx.startsWith("0x") && <a className="button button-small button-quiet" href={etherscanTx(order.tx)} target="_blank" rel="noreferrer">Payment</a>}
        {jobId && <a className="button button-small" href={`${IMD_EXPLORER}/jobs/${jobId}`} target="_blank" rel="noreferrer">Open in IMD explorer</a>}
        {job && isTerminal(job.state) && <a className="button button-small button-primary" href={`#/swarm?parent=${job.project?.head ?? job.id}`} onClick={() => setTimeout(() => (document.getElementById("sw-parent") as HTMLInputElement | null)?.focus(), 50)}>Build the next version</a>}
      </div>
    </div>
  );
}
