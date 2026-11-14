/** Pure logic: splits, token plans, validation, metadata and risk. Unit-tested in test/unit. */

export type Share = { id: string; label: string; bps: number; note: string };

/** Eligible net platform revenue split (brief section 6). Customer deposits and trading volume are never revenue. */
export const REVENUE_SPLIT: Share[] = [
  { id: "treasury", label: "IMD ecosystem treasury", bps: 2500, note: "Held in the ecosystem multisig." },
  { id: "ops", label: "Development and operations", bps: 2000, note: "Infrastructure, RPC, reviews." },
  { id: "workers", label: "IMD NFT worker rewards", bps: 2000, note: "Paid for verified Swarm work." },
  { id: "burn", label: "IMD buyback and permanent burn", bps: 2000, note: "Bought on Ethereum, sent to the dead address." },
  { id: "dev", label: "Developer IMD accumulation", bps: 1500, note: "Sent to the developer's disclosed wallet." },
];

/** PIMD proposed distribution (brief section 5). */
export const PIMD = { name: "Pump IMD", symbol: "PIMD", supply: 1_000_000_000, decimals: 6 };
export const PIMD_SPLIT: Share[] = [
  { id: "public", label: "Public trading and liquidity", bps: 3000, note: "Sold on the LaunchLab curve, then the Raydium pool." },
  { id: "airdrops", label: "Community airdrops", bps: 3000, note: "Reserve: 12-month linear vesting, multisig." },
  { id: "ecosystem", label: "Ecosystem development", bps: 2000, note: "Reserve: 6-month cliff, 24-month vesting." },
  { id: "marketing", label: "Marketing and partnerships", bps: 1000, note: "Reserve: 3-month cliff, 12-month vesting." },
  { id: "treasury", label: "Developer treasury", bps: 1000, note: "Reserve: 12-month cliff, 24-month vesting." },
];
export const MAX_RESERVE_BPS = 7000;

export const sumBps = (s: Share[]) => s.reduce((a, b) => a + b.bps, 0);
export const reserveBps = (s: Share[]) => s.filter((x) => x.id !== "public").reduce((a, b) => a + b.bps, 0);

/** Split an amount (in the smallest unit) by basis points; the remainder from rounding goes to the first share. */
export function splitAmount(total: bigint, shares: Share[]): { id: string; amount: bigint }[] {
  if (total < 0n) throw new Error("negative amount");
  const out = shares.map((s) => ({ id: s.id, amount: (total * BigInt(s.bps)) / 10000n }));
  const rest = total - out.reduce((a, b) => a + b.amount, 0n);
  if (out.length) out[0].amount += rest;
  return out;
}

/** Minimum output after slippage, in basis points. */
export const minOut = (quote: bigint, slippageBps: number) => (quote * BigInt(10000 - slippageBps)) / 10000n;

// ---- Token form --------------------------------------------------------------------------
export type TokenForm = {
  name: string; symbol: string; description: string; image: string;
  website: string; x: string; telegram: string; initialBuySol: string;
};
export const emptyForm: TokenForm = { name: "", symbol: "", description: "", image: "", website: "", x: "", telegram: "", initialBuySol: "" };

const isUrl = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "ipfs:" || u.protocol === "ar:"; } catch { return false; } };

export function validateToken(f: TokenForm): Partial<Record<keyof TokenForm, string>> {
  const e: Partial<Record<keyof TokenForm, string>> = {};
  const name = f.name.trim();
  if (!name) e.name = "Enter a token name.";
  else if (new TextEncoder().encode(name).length > 32) e.name = "Use 32 characters or fewer.";
  const sym = f.symbol.trim();
  if (!sym) e.symbol = "Enter a ticker.";
  else if (!/^[A-Za-z0-9]{1,10}$/.test(sym)) e.symbol = "Use 1 to 10 letters or digits.";
  if (f.description.length > 500) e.description = "Keep the description under 500 characters.";
  if (f.image && !isUrl(f.image) && !f.image.startsWith("data:image/")) e.image = "Choose an image file or paste an https link.";
  for (const k of ["website", "x", "telegram"] as const) if (f[k] && !isUrl(f[k])) e[k] = "Paste a full link starting with https://";
  if (f.initialBuySol) {
    const n = Number(f.initialBuySol);
    if (!Number.isFinite(n) || n < 0) e.initialBuySol = "Enter an amount of SOL, for example 0.5.";
    else if (n > 85) e.initialBuySol = "An initial buy can't exceed the curve's 85 SOL target.";
  }
  return e;
}

/** Metaplex-compatible token metadata, generated from the form. */
export function buildMetadata(f: TokenForm, imageUri: string) {
  const extensions: Record<string, string> = {};
  if (f.website) extensions.website = f.website;
  if (f.x) extensions.twitter = f.x;
  if (f.telegram) extensions.telegram = f.telegram;
  return {
    name: f.name.trim(),
    symbol: f.symbol.trim().toUpperCase(),
    description: f.description.trim(),
    image: imageUri,
    ...(f.website ? { external_url: f.website } : {}),
    extensions,
    properties: { files: imageUri ? [{ uri: imageUri, type: guessMime(imageUri) }] : [], category: "image" },
    createdOn: "IMD Launchpad",
  };
}
const guessMime = (u: string) => (/\.png($|\?)/i.test(u) ? "image/png" : /\.(jpe?g)($|\?)/i.test(u) ? "image/jpeg" : /\.gif($|\?)/i.test(u) ? "image/gif" : /\.svg($|\?)/i.test(u) ? "image/svg+xml" : "image/webp");

/** SOL string to lamports without floating point drift. */
export function solToLamports(v: string): bigint {
  const t = v.trim();
  if (!t) return 0n;
  if (!/^\d*(\.\d{0,9})?$/.test(t)) throw new Error("bad SOL amount");
  const [i, d = ""] = t.split(".");
  return BigInt(i || "0") * 1_000_000_000n + BigInt((d + "000000000").slice(0, 9));
}

export function formatUnits(v: bigint, decimals: number, max = 4): string {
  const neg = v < 0n; const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const i = a / base; let f = (a % base).toString().padStart(decimals, "0").slice(0, max).replace(/0+$/, "");
  return `${neg ? "-" : ""}${i.toLocaleString("en-US")}${f ? "." + f : ""}`;
}

export function compactUsd(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

// ---- Risk indicators ---------------------------------------------------------------------
export type RiskInput = { mintAuthority: string | null; freezeAuthority: string | null; topHolderPct?: number; top10Pct?: number; liquidityUsd?: number; ageHours?: number };
export type Risk = { level: "low" | "medium" | "high"; flags: string[] };
export function assessRisk(r: RiskInput): Risk {
  const flags: string[] = []; let score = 0;
  if (r.mintAuthority) { flags.push("The mint authority is still set: more tokens can be created."); score += 3; }
  if (r.freezeAuthority) { flags.push("A freeze authority is set: holders' tokens can be frozen."); score += 3; }
  if (r.topHolderPct != null && r.topHolderPct > 20) { flags.push(`One wallet holds ${r.topHolderPct.toFixed(1)}% of supply.`); score += 2; }
  if (r.top10Pct != null && r.top10Pct > 50) { flags.push(`The top 10 wallets hold ${r.top10Pct.toFixed(1)}% of supply.`); score += 1; }
  if (r.liquidityUsd != null && r.liquidityUsd < 10_000) { flags.push("Pool liquidity is under $10K: large trades move the price."); score += 1; }
  if (r.ageHours != null && r.ageHours < 24) { flags.push("Launched less than a day ago."); score += 1; }
  return { level: score >= 3 ? "high" : score >= 1 ? "medium" : "low", flags };
}

// ---- Swarm brief -------------------------------------------------------------------------
export type SwarmKind = "website" | "branding" | "game" | "app" | "marketing" | "social" | "project";
export const SWARM_KINDS: { id: SwarmKind; label: string; skill: string; hint: string }[] = [
  { id: "project", label: "Complete project", skill: "build-website", hint: "Website, brand, launch plan and posts" },
  { id: "website", label: "Website", skill: "build-website", hint: "Published to IPFS under an ENS name" },
  { id: "branding", label: "Logo and branding", skill: "create-image", hint: "Logo, banner and palette" },
  { id: "game", label: "Browser game", skill: "build-website", hint: "A playable web game" },
  { id: "app", label: "Web app", skill: "build-website", hint: "A working single-page app" },
  { id: "marketing", label: "Marketing plan", skill: "research-report", hint: "A sourced go-to-market report" },
  { id: "social", label: "X and Telegram content", skill: "research-report", hint: "Launch posts and a content calendar" },
];

export function siteLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/, "") || "imd-project";
}

export function buildSwarmBody(kind: SwarmKind, idea: string, token?: { name: string; symbol: string; mint?: string }) {
  const k = SWARM_KINDS.find((x) => x.id === kind)!;
  const tokenLine = token?.name ? ` The project's Solana token is ${token.name} (${token.symbol.toUpperCase()})${token.mint ? `, mint ${token.mint}` : ""}.` : "";
  const extra: Record<SwarmKind, string> = {
    project: " Deliver a one-page website for the project with its brand, token details, how to buy, and a launch announcement for X and a welcome message for Telegram on the page.",
    website: " Build its website.",
    branding: " Create its logo as a square image on a plain background.",
    game: " Build a small browser game themed on the project, playable on a phone.",
    app: " Build a single-page web app for the project.",
    marketing: " Write a go-to-market plan with channels, a two-week calendar and success measures.",
    social: " Write ten X posts and three Telegram announcements for the launch, plain and factual, with no price promises.",
  };
  const objective = `${idea.trim()}${tokenLine}${extra[kind]}`.slice(0, 8000);
  const body: Record<string, string> = { objective, skill: k.skill };
  if (k.skill === "build-website") body.ipfs = siteLabel(token?.name || idea.split(/\s+/).slice(0, 4).join(" "));
  return body;
}
