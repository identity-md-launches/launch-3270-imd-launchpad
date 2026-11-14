import { useEffect, useState } from "react";
import { OWNER } from "../config";
import { buildMetadata, emptyForm, solToLamports, validateToken, type TokenForm } from "../lib/economics";
import { explorerTx, isMint } from "../lib/solana";
import { notify, useLocal, type Launched } from "../lib/store";
import { useSol } from "../solctx";
import { TokenList } from "./Discover";
import { trending, type Pair } from "../lib/dexscreener";

export function Home() {
  return (
    <>
      <section className="wrap hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Idea in. Ecosystem out.</h1>
          <p className="lede">Launch a Solana token in one step, then let IMD Swarm build the rest.</p>
        </div>
        <LaunchForm />
      </section>
      <TrendingStrip />
      <section className="wrap section" aria-labelledby="how-title">
        <h2 id="how-title">How a launch works</h2>
        <ol className="steps">
          <li className="card"><h3>Create</h3><p className="muted">Name, ticker, image and an optional first buy. The metadata is written for you.</p></li>
          <li className="card"><h3>Trade on the curve</h3><p className="muted">Price follows a Raydium LaunchLab bonding curve as people buy and sell.</p></li>
          <li className="card"><h3>Graduate</h3><p className="muted">At 85 SOL raised, liquidity moves to a Raydium pool and DexScreener lists it.</p></li>
          <li className="card"><h3>Build with Swarm</h3><p className="muted">For 0.5 IMD, AI workers build the website, brand, game or posts.</p></li>
        </ol>
      </section>
    </>
  );
}

function TrendingStrip() {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { trending().then((p) => setPairs(p.slice(0, 6))).catch(() => setErr(true)); }, []);
  return (
    <section className="wrap section" aria-labelledby="trend-title">
      <div className="section-head"><h2 id="trend-title">Trending on Solana</h2><a href="#/discover">See all</a></div>
      {err ? <p className="muted">Market data didn't load. Check your connection and reload.</p> : <TokenList pairs={pairs} />}
    </section>
  );
}

type Stage = { kind: "form" } | { kind: "review" } | { kind: "signing" } | { kind: "done"; mint: string; sigs: string[] } | { kind: "error"; msg: string };

export function LaunchForm() {
  const { address, provider, cluster, openConnect } = useSol();
  const [f, setF] = useState<TokenForm>(emptyForm);
  const [preview, setPreview] = useState("");
  const [uri, setUri] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof TokenForm | "uri" | "mainnet", string>>>({});
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [ackMainnet, setAckMainnet] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [, setLaunched] = useLocal<Launched[]>("launched", []);
  const set = (k: keyof TokenForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const metadata = buildMetadata(f, f.image);
  const download = () => {
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${f.symbol || "token"}-metadata.json`; a.click();
    URL.revokeObjectURL(a.href);
  };

  async function review(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = validateToken(f);
    if (!f.image) errs.image = "Add an image link. Choose a file to preview it first.";
    if (!OWNER.metadataUploadUrl && !/^(https|ipfs|ar):\/\//.test(uri)) errs.uri = "Download the metadata file, host it on IPFS or Arweave, then paste its link.";
    if (cluster === "mainnet" && !ackMainnet) errs.mainnet = "Confirm that this launch spends real SOL.";
    setErrors(errs);
    if (Object.keys(errs).length) { document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus(); return; }
    setStage({ kind: "review" });
  }

  async function launch() {
    if (!provider || !address) return openConnect();
    setStage({ kind: "signing" });
    try {
      let metaUri = uri;
      if (OWNER.metadataUploadUrl) {
        const r = await fetch(OWNER.metadataUploadUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(metadata) });
        if (!r.ok) throw new Error("The metadata upload failed.");
        metaUri = (await r.json()).uri;
      }
      const { createToken } = await import("../lib/launchlab");
      const res = await createToken(cluster, provider, { name: f.name.trim(), symbol: f.symbol.trim().toUpperCase(), uri: metaUri, buyLamports: solToLamports(f.initialBuySol || "0") });
      setLaunched((l) => [{ mint: res.mint, name: f.name.trim(), symbol: f.symbol.trim().toUpperCase(), image: f.image, cluster, creator: address, at: Date.now(), signatures: res.signatures }, ...l]);
      notify(`${f.symbol.toUpperCase()} launched on ${cluster}.`, `#/token/${res.mint}`);
      setStage({ kind: "done", mint: res.mint, sigs: res.signatures });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStage({ kind: "error", msg: /reject|denied|cancel/i.test(msg) ? "You declined the signature in your wallet. Nothing was sent." : `The launch didn't go through: ${msg}` });
    }
  }

  if (stage.kind === "done") return (
    <div className="card launch-card" role="status">
      <h2>{f.symbol.toUpperCase()} is live on {cluster}</h2>
      <p className="muted">Trading is open on its bonding curve.</p>
      <p className="mono-wrap num">{stage.mint}</p>
      <div className="actions">
        <a className="button button-primary" href={`#/token/${stage.mint}`}>Open the token page</a>
        <a className="button" href={`#/swarm?mint=${stage.mint}&name=${encodeURIComponent(f.name)}&symbol=${encodeURIComponent(f.symbol)}`}>Build with Swarm</a>
        {stage.sigs[0] && <a className="button button-quiet" href={explorerTx(stage.sigs[0], cluster)} target="_blank" rel="noreferrer">Transaction</a>}
      </div>
      <button type="button" className="link-button" onClick={() => { setF(emptyForm); setUri(""); setPreview(""); setStage({ kind: "form" }); }}>Launch another</button>
    </div>
  );

  if (stage.kind === "review" || stage.kind === "signing" || stage.kind === "error") return (
    <div className="card launch-card">
      <h2>Review and sign</h2>
      <dl className="facts">
        <div><dt>Token</dt><dd>{f.name} ({f.symbol.toUpperCase()})</dd></div>
        <div><dt>Network</dt><dd>Solana {cluster}</dd></div>
        <div><dt>Supply</dt><dd className="num">1,000,000,000</dd></div>
        <div><dt>Curve</dt><dd>Raydium LaunchLab, graduates at 85 SOL</dd></div>
        <div><dt>Your first buy</dt><dd className="num">{f.initialBuySol || "0"} SOL</dd></div>
        <div><dt>Authorities</dt><dd>Mint and freeze authority revoked by LaunchLab</dd></div>
      </dl>
      <p className="hint">Your wallet shows each transaction before you sign. Network fees are about 0.02 SOL.</p>
      {stage.kind === "error" && <p className="error" role="alert">{stage.msg}</p>}
      <div className="actions">
        <button type="button" className="button button-primary" onClick={launch} disabled={stage.kind === "signing"}>
          {stage.kind === "signing" ? "Waiting for your wallet…" : address ? "Create and launch" : "Connect to launch"}
        </button>
        <button type="button" className="button button-quiet" onClick={() => setStage({ kind: "form" })} disabled={stage.kind === "signing"}>Edit</button>
      </div>
    </div>
  );

  const err = (k: keyof typeof errors) => errors[k] ? <p className="error" id={`e-${k}`}>{errors[k]}</p> : null;
  const aria = (k: keyof typeof errors) => ({ id: `f-${k}`, "aria-invalid": !!errors[k] || undefined, "aria-describedby": errors[k] ? `e-${k}` : undefined });
  return (
    <form className="card launch-card" onSubmit={review} noValidate aria-labelledby="launch-title">
      <h2 id="launch-title">Create a token</h2>
      <div className="grid-2">
        <div className="field"><label htmlFor="f-name">Name</label><input {...aria("name")} value={f.name} onChange={set("name")} placeholder="Harbor Cat" maxLength={32} autoComplete="off" />{err("name")}</div>
        <div className="field"><label htmlFor="f-symbol">Ticker</label><input {...aria("symbol")} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} placeholder="HCAT" maxLength={10} autoComplete="off" />{err("symbol")}</div>
      </div>
      <div className="field">
        <label htmlFor="f-image">Image link</label>
        <div className="image-row">
          <label className="thumb-pick" title="Preview a file">
            {preview || f.image ? <img className="thumb" src={preview || f.image} alt="" width={44} height={44} /> : <span className="thumb thumb-empty thumb-add" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg></span>}
            <input type="file" accept="image/*" className="visually-hidden" aria-label="Preview a file" onChange={(e) => { const file = e.target.files?.[0]; if (file) setPreview(URL.createObjectURL(file)); }} />
          </label>
          <input {...aria("image")} type="url" value={f.image} onChange={set("image")} placeholder="https://… or ipfs://…" inputMode="url" />
        </div>
        {err("image")}
      </div>
      <div className="field"><label htmlFor="f-initialBuySol">First buy in SOL (optional)</label><input {...aria("initialBuySol")} inputMode="decimal" value={f.initialBuySol} onChange={set("initialBuySol")} placeholder="0.5" />{err("initialBuySol")}</div>
      <button type="button" className="link-button" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>{showMore ? "Hide description and socials" : "Add description and socials"}</button>
      {showMore && (
        <div className="stack-tight">
          <div className="field"><label htmlFor="f-description">Description</label><textarea {...aria("description")} rows={3} value={f.description} onChange={set("description")} />{err("description")}</div>
          <div className="grid-3">
            <div className="field"><label htmlFor="f-website">Website</label><input {...aria("website")} type="url" value={f.website} onChange={set("website")} placeholder="https://" />{err("website")}</div>
            <div className="field"><label htmlFor="f-x">X</label><input {...aria("x")} type="url" value={f.x} onChange={set("x")} placeholder="https://x.com/…" />{err("x")}</div>
            <div className="field"><label htmlFor="f-telegram">Telegram</label><input {...aria("telegram")} type="url" value={f.telegram} onChange={set("telegram")} placeholder="https://t.me/…" />{err("telegram")}</div>
          </div>
        </div>
      )}
      {!OWNER.metadataUploadUrl && (
        <div className="field">
          <div className="field-head"><label htmlFor="f-uri">Metadata link</label><button type="button" className="link-button" onClick={download} disabled={!f.name || !f.symbol}>Download metadata file</button></div>
          <input {...aria("uri")} type="url" value={uri} onChange={(e) => setUri(e.target.value)} placeholder="ipfs://… or https://arweave.net/…" />
          <p className="hint">The metadata is generated from this form. Host the file, then paste its link.</p>
          {err("uri")}
        </div>
      )}
      {cluster === "mainnet" && (
        <label className="check"><input type="checkbox" id="f-mainnet" checked={ackMainnet} onChange={(e) => setAckMainnet(e.target.checked)} /> I understand this launch spends real SOL on mainnet.</label>
      )}
      {err("mainnet")}
      <div className="actions">
        <button type="submit" className="button button-primary button-wide">Create and launch</button>
        <a className="button button-wide" href="#/swarm">Build with Swarm · 0.5 IMD</a>
      </div>
      <p className="hint">Quick launch needs no AI job. You are on Solana {cluster}.</p>
    </form>
  );
}

export const looksLikeMint = isMint;
