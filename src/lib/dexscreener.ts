/** DexScreener public API (no key). Solana mainnet only. */
const API = "https://api.dexscreener.com";
export type Pair = {
  chainId: string; dexId: string; url: string; pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string; priceChange?: { h1?: number; h24?: number }; volume?: { h24?: number };
  liquidity?: { usd?: number }; marketCap?: number; fdv?: number; pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] };
  txns?: { h24?: { buys: number; sells: number } };
};
const j = async <T>(u: string): Promise<T> => { const r = await fetch(u); if (!r.ok) throw new Error(`DexScreener ${r.status}`); return r.json(); };

/** Best (most liquid) pair for each token address, up to 30 per call. */
export async function pairsFor(mints: string[]): Promise<Pair[]> {
  if (!mints.length) return [];
  const pairs = await j<Pair[]>(`${API}/tokens/v1/solana/${mints.slice(0, 30).join(",")}`);
  const best = new Map<string, Pair>();
  for (const p of pairs) { const k = p.baseToken.address; const c = best.get(k); if (!c || (p.liquidity?.usd ?? 0) > (c.liquidity?.usd ?? 0)) best.set(k, p); }
  return mints.map((m) => best.get(m)).filter(Boolean) as Pair[];
}
export async function trending(): Promise<Pair[]> {
  const boosts = await j<{ chainId: string; tokenAddress: string }[]>(`${API}/token-boosts/top/v1`);
  return pairsFor([...new Set(boosts.filter((b) => b.chainId === "solana").map((b) => b.tokenAddress))]);
}
export async function newest(): Promise<Pair[]> {
  const prof = await j<{ chainId: string; tokenAddress: string }[]>(`${API}/token-profiles/latest/v1`);
  const pairs = await pairsFor([...new Set(prof.filter((b) => b.chainId === "solana").map((b) => b.tokenAddress))]);
  return pairs.sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0));
}
export async function search(q: string): Promise<Pair[]> {
  const r = await j<{ pairs: Pair[] | null }>(`${API}/latest/dex/search?q=${encodeURIComponent(q)}`);
  const seen = new Set<string>();
  return (r.pairs ?? []).filter((p) => p.chainId === "solana" && !seen.has(p.baseToken.address) && seen.add(p.baseToken.address)).slice(0, 30);
}
