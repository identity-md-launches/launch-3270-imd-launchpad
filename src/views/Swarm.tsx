import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ETH_CHAIN_ID, IMD_EXPLORER, IMD_INTAKE, IMD_PAY_TO, IMD_TOKEN, SWARM_FEE_WEI } from "../config";
import { buildSwarmBody, formatUnits, SWARM_KINDS, type SwarmKind } from "../lib/economics";
import { actionId, encodeBody, ERC20_ABI, feeProblem, fetchIntake, fetchJob, fetchJobResult, fetchSwarm, INTAKE_ABI, intakeStatus, isTerminal, NO_CALLBACK, requestFingerprint, type Job, type JobResult, type SwarmStats } from "../lib/imd";
import { notify, useLocal, writeLocal, type PendingPayment, type SwarmOrder } from "../lib/store";
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

type Phase = "idle" | "approving" | "checking" | "paying" | "confirming" | "done";
type StepState = "done" | "now" | "todo" | "stop";

function Steps({ items }: { items: { label: string; detail: string; state: StepState }[] }) {
  return (
    <ol className="flow" aria-label="Payment steps">
      {items.map((s, i) => (
        <li key={s.label} className={`flow-step flow-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
          <span className="flow-n num" aria-hidden="true">{s.state === "done" ? "✓" : i + 1}</span>
          <span><strong>{s.label}</strong><span className="visually-hidden">{s.state === "done" ? ", done" : s.state === "stop" ? ", blocked" : s.state === "now" ? ", current step" : ""}</span><span className="muted">{s.detail}</span></span>
        </li>
      ))}
    </ol>
  );
}

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [again, setAgain] = useState(false);
  const busy = useRef(false);
  const { address, chainId, connector } = useAccount();
  const client = usePublicClient({ chainId: ETH_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [orders, setOrders] = useLocal<SwarmOrder[]>("swarm-orders", []);
  const [pending, setPending] = useLocal<PendingPayment | null>("swarm-pending", null);

  const action = parent ? "job.continue" : "job.open";
  const body: Record<string, string> = { ...buildSwarmBody(kind, idea || "Describe the project.", token.name ? token : undefined), ...(parent ? { parentJobId: parent } : {}) };
  const fp = requestFingerprint(action, body);
  const dup = orders.find((o) => o.fp === fp);

  // Step 2: the fee is read from Intakev2 itself, for this action and IMD, before anything is signed.
  const fee = useReadContract({ address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "priceOf", args: [actionId(action), IMD_TOKEN], chainId: ETH_CHAIN_ID });
  const feeStop = fee.isError ? "The fee couldn't be read from the IMD intake. Check your connection and reload." : fee.isLoading ? null : feeProblem(fee.data, SWARM_FEE_WEI);
  const feeOk = fee.data != null && !feeStop;

  const bal = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const allow = useReadContract({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, IMD_INTAKE] : undefined, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const ethBal = useBalance({ address, chainId: ETH_CHAIN_ID, query: { enabled: !!address } });
  const enough = (bal.data ?? 0n) >= SWARM_FEE_WEI;
  const approved = (allow.data ?? 0n) >= SWARM_FEE_WEI;
  const wrongChain = !!address && chainId !== ETH_CHAIN_ID;
  const ready = !!address && !wrongChain;

  // Step 3: Ethereum gas, estimated by the RPC for this wallet. The request can only be estimated once the approval exists.
  const [gas, setGas] = useState<{ price: bigint; approve?: bigint; request?: bigint } | null>(null);
  const bodyHex = encodeBody(body);
  useEffect(() => {
    if (!ready || !client || !feeOk) { setGas(null); return; }
    let alive = true;
    (async () => {
      const price = await client.getGasPrice();
      const approveGas = approved ? undefined : await client.estimateContractGas({ account: address!, address: IMD_TOKEN, abi: ERC20_ABI, functionName: "approve", args: [IMD_INTAKE, SWARM_FEE_WEI] }).catch(() => undefined);
      const requestGas = approved ? await client.estimateContractGas({ account: address!, address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "request", args: [actionId(action), bodyHex, NO_CALLBACK, IMD_TOKEN, SWARM_FEE_WEI] }).catch(() => undefined) : undefined;
      if (alive) setGas({ price, approve: approveGas, request: requestGas });
    })().catch(() => alive && setGas(null));
    return () => { alive = false; };
  }, [ready, client, feeOk, approved, address, action, bodyHex]);
  const gasWei = gas ? ((gas.approve ?? 0n) + (gas.request ?? 0n)) * gas.price : null;

  // A payment sent before a reload: resume watching it instead of offering to pay again.
  useEffect(() => {
    if (!pending || !client || busy.current) return;
    let alive = true;
    setPhase("confirming");
    client.waitForTransactionReceipt({ hash: pending.tx }).then((rc) => {
      if (!alive) return;
      if (rc.status === "success") {
        setOrders((o) => (o.some((x) => x.tx === pending.tx) ? o : [{ tx: pending.tx, fp: pending.fp, kind: pending.kind, objective: pending.objective, at: pending.at, payer: pending.payer }, ...o]));
        setPhase("done");
      } else { setErr("The payment transaction reverted. No IMD left your wallet; you can try again."); setPhase("idle"); }
      setPending(null);
    }).catch(() => alive && setPhase("idle"));
    return () => { alive = false; };
  }, [pending?.tx, client]); // eslint-disable-line

  async function pay() {
    if (busy.current || pending) return;
    setErr("");
    if (idea.trim().length < 20) return setErr("Describe the project in at least one full sentence.");
    if (!confirm) return setErr("Confirm the brief and the 0.5 IMD payment first.");
    if (dup && !again) return setErr("You already paid for this exact brief. Tick “Pay again” only if you want a second job.");
    if (!feeOk || !client || !address) return;
    busy.current = true;
    try {
      if (!approved) {
        setPhase("approving");
        const h = await writeContractAsync({ address: IMD_TOKEN, abi: ERC20_ABI, functionName: "approve", args: [IMD_INTAKE, SWARM_FEE_WEI], chainId: ETH_CHAIN_ID });
        const arc = await client.waitForTransactionReceipt({ hash: h });
        if (arc.status !== "success") throw new Error("the approval reverted");
        const a = await allow.refetch();
        if ((a.data ?? 0n) < SWARM_FEE_WEI) throw new Error("the approval hasn't reached the chain yet; try again in a moment");
      }
      // The intake checks the fee and pulls the IMD; simulating first means a call that would revert never reaches the wallet.
      setPhase("checking");
      await client.simulateContract({ account: address, address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "request", args: [actionId(action), bodyHex, NO_CALLBACK, IMD_TOKEN, SWARM_FEE_WEI] });
      setPhase("paying");
      const tx = await writeContractAsync({ address: IMD_INTAKE, abi: INTAKE_ABI, functionName: "request", args: [actionId(action), bodyHex, NO_CALLBACK, IMD_TOKEN, SWARM_FEE_WEI], chainId: ETH_CHAIN_ID });
      const rec: PendingPayment = { tx, fp, kind, objective: body.objective, at: Date.now(), payer: address };
      writeLocal("swarm-pending", rec);
      setPhase("confirming");
      const rc = await client.waitForTransactionReceipt({ hash: tx });
      writeLocal("swarm-pending", null);
      if (rc.status !== "success") throw new Error("the payment transaction reverted, so no IMD moved");
      setOrders((o) => (o.some((x) => x.tx === tx) ? o : [{ tx, fp, kind, objective: body.objective, at: rec.at, payer: address }, ...o]));
      notify("Swarm payment confirmed. Waiting for the IMD API to admit the job.", etherscanTx(tx));
      setPhase("done"); setAgain(false); bal.refetch(); allow.refetch();
    } catch (e) {
      const m = e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0] : String(e);
      setErr(/reject|denied/i.test(m) ? "You declined in your wallet. Nothing was paid." : `Payment didn't complete: ${m}`);
      setPhase("idle");
    } finally { busy.current = false; }
  }

  const working = phase === "approving" || phase === "checking" || phase === "paying" || phase === "confirming";
  const steps: { label: string; detail: string; state: StepState }[] = [
    { label: "Connect MetaMask or Rabby", detail: ready ? `${connector?.name ?? "Wallet"} on Ethereum Mainnet` : wrongChain ? "Switch the wallet to Ethereum Mainnet" : "Ethereum Mainnet, chain ID 1", state: ready ? "done" : "now" },
    { label: "Verify the official fee", detail: feeStop ?? (feeOk ? `${formatUnits(fee.data!, 18)} IMD, read from IMD Intakev2` : "Reading the fee from IMD Intakev2…"), state: feeStop ? "stop" : feeOk ? "done" : ready ? "now" : "todo" },
    { label: "Review the cost", detail: !feeOk ? "0.5 IMD plus Ethereum gas" : `0.5 IMD + ${gasWei != null ? `about ${formatUnits(gasWei, 18, 6)} ETH gas` : "Ethereum gas"}${gas && !approved ? " for the approval; the request is estimated after it" : ""}`, state: ready && feeOk ? "done" : "todo" },
    { label: "Approve exactly 0.5 IMD", detail: approved ? "Approved: the intake can pull 0.5 IMD" : "One signature, never an unlimited allowance", state: approved ? "done" : phase === "approving" ? "now" : "todo" },
    { label: "Pay and submit the job", detail: phase === "done" ? "Confirmed on Ethereum" : pending ? "Confirming on Ethereum…" : "One signature: the intake takes 0.5 IMD and records your brief", state: phase === "done" ? "done" : phase === "paying" || phase === "confirming" || phase === "checking" ? "now" : "todo" },
    { label: "Verified by the IMD API", detail: "The API reads the payment and admits the job", state: phase === "done" ? "now" : "todo" },
    { label: "Job ID, progress and results", detail: "Shown below as workers deliver", state: "todo" },
  ];

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
      <details className="details"><summary>See the exact request</summary><pre className="code">{JSON.stringify({ action: `${action}@job-1`, body }, null, 2)}</pre></details>
      <Steps items={steps} />
      <label className="check"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I've checked the brief. Pay 0.5 IMD on Ethereum to start it.</label>
      {dup && <label className="check hint-warn"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> You already paid for this exact brief{dup.jobId ? ` (job ${dup.jobId})` : ""}. Pay again for a second job.</label>}
      {ready && (
        <p className="hint num">Balance: {bal.data != null ? formatUnits(bal.data, 18) : "…"} IMD · {ethBal.data ? formatUnits(ethBal.data.value, 18, 5) : "…"} ETH</p>
      )}
      {ready && bal.data != null && !enough && <p className="error">This wallet holds less than 0.5 IMD.</p>}
      {ready && ethBal.data && gasWei != null && ethBal.data.value < gasWei && <p className="error">This wallet may not hold enough ETH for gas.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {phase === "done" && <p className="hint" role="status">Paid. The IMD API is verifying the payment; your job appears below once it's admitted.</p>}
      <div className="actions">
        {!ready ? <ConnectSheet /> : (
          <button type="button" className="button button-primary" onClick={pay} disabled={working || !!pending || !enough || !feeOk}>
            {phase === "approving" ? "Approving 0.5 IMD…" : phase === "checking" ? "Checking the request…" : phase === "paying" ? "Confirm in your wallet…" : phase === "confirming" || pending ? "Confirming payment…" : approved ? "Build with IMD Swarm: pay 0.5 IMD" : "Build with IMD Swarm: approve, then pay"}
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

const DONE_NODE = /^(completed|done|accepted|published|verified)$/;

function JobTracker({ order }: { order: SwarmOrder }) {
  const [jobId, setJobId] = useState<string | null>(order.jobId ?? null);
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [intake, setIntake] = useState<ReturnType<typeof intakeStatus>>(order.jobId ? { kind: "admitted", jobId: order.jobId } : { kind: "unseen" });
  const [note, setNote] = useState("");
  const [, setOrders] = useLocal<SwarmOrder[]>("swarm-orders", []);
  useEffect(() => {
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        let id = jobId;
        if (!id && order.tx.startsWith("0x")) {
          const st = intakeStatus(await fetchIntake(ETH_CHAIN_ID, order.tx));
          if (!alive) return;
          setIntake(st); setNote("");
          if (st.kind === "refused") return;
          id = st.jobId ?? null;
          if (id) { setJobId(id); setOrders((list) => list.map((o) => (o.tx === order.tx ? { ...o, jobId: id! } : o))); }
        }
        if (id) {
          const j = await fetchJob(id);
          if (!alive) return;
          setJob(j); setNote("");
          if (j && isTerminal(j.state)) {
            if (j.state === "completed") { setResult(await fetchJobResult(id)); notify("Your Swarm job is complete.", `${IMD_EXPLORER}/jobs/${id}`); }
            return;
          }
        }
      } catch { if (alive) setNote("The IMD API didn't answer. Retrying…"); }
      if (alive) timer = setTimeout(poll, 10000);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [order.tx, jobId]); // eslint-disable-line

  const nodes = job?.nodes ?? [];
  const done = nodes.filter((n) => DONE_NODE.test(n.state ?? "")).length;
  const verify = intake.kind === "refused" ? `Refused by the IMD API: ${intake.reason ?? "no reason given"}.`
    : intake.kind === "admitted" || jobId ? "Payment verified by the IMD API. Job admitted."
    : intake.kind === "seen" ? "The IMD API has seen the payment and is admitting the job…"
    : "Waiting for the IMD API to see the payment…";
  const delivery = job?.delivery;
  const siteUrl = delivery?.site?.url ?? job?.site?.url;
  return (
    <div className="card" aria-live="polite">
      <div className="field-head"><h2>{order.kind === "tracked" ? "Followed job" : SWARM_KINDS.find((k) => k.id === order.kind)?.label ?? "Swarm job"}</h2>{job && <span className={`pill state-${job.state}`}>{job.state}</span>}</div>
      {order.objective && <p className="muted clamp">{order.objective}</p>}
      {order.tx.startsWith("0x") && <p className={intake.kind === "refused" ? "error" : "hint"}>{verify}</p>}
      {jobId && <p className="hint">Job ID <span className="num mono-wrap">{jobId}</span></p>}
      {note && <p className="hint hint-warn">{note}</p>}
      {nodes.length > 0 && (
        <div className="progress-block">
          <div className="field-head"><span>Worker progress</span><span className="num">{done} of {nodes.length} steps</span></div>
          <div className="progress" role="progressbar" aria-label="Worker progress" aria-valuemin={0} aria-valuemax={nodes.length} aria-valuenow={done}><span style={{ inlineSize: `${(done / nodes.length) * 100}%` }} /></div>
          <ol className="job-steps">{nodes.map((n, i) => <li key={n.id ?? i}><span>{n.title ?? n.skill ?? `Step ${i + 1}`}</span><span className="muted">{n.state ?? ""}</span></li>)}</ol>
        </div>
      )}
      {job?.state === "blocked" && <p className="error">Blocked: {job.blockedReason ?? "see the explorer for details"}.</p>}
      {(result?.files?.length || siteUrl || delivery?.pullRequestUrl) ? (
        <>
          <h3>Results</h3>
          <ul className="link-list">
            {siteUrl && <li><a href={siteUrl} target="_blank" rel="noreferrer">Live site</a></li>}
            {delivery?.pullRequestUrl && <li><a href={delivery.pullRequestUrl} target="_blank" rel="noreferrer">Source pull request</a></li>}
            {result?.files?.map((f) => <li key={f.path}><a href={f.url} target="_blank" rel="noreferrer">{f.name || f.path}</a></li>)}
          </ul>
        </>
      ) : null}
      <div className="actions">
        {order.tx.startsWith("0x") && <a className="button button-small button-quiet" href={etherscanTx(order.tx)} target="_blank" rel="noreferrer">Payment</a>}
        {jobId && <a className="button button-small" href={`${IMD_EXPLORER}/jobs/${jobId}`} target="_blank" rel="noreferrer">Open in IMD explorer</a>}
        {job && isTerminal(job.state) && <a className="button button-small button-primary" href={`#/swarm?parent=${job.project?.head ?? job.id}`} onClick={() => setTimeout(() => (document.getElementById("sw-parent") as HTMLInputElement | null)?.focus(), 50)}>Build the next version</a>}
      </div>
    </div>
  );
}
