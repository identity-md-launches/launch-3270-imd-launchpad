import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { SOLANA_RPC, type SolanaCluster } from "../config";

type AnyTx = Transaction | VersionedTransaction;
/** The legacy provider interface Phantom and Solflare both inject. The site never sees a private key. */
export type SolProvider = {
  publicKey?: { toBase58(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<unknown>;
  disconnect(): Promise<void>;
  signAllTransactions<T extends AnyTx>(txs: T[]): Promise<T[]>;
  on?(ev: string, cb: (...a: unknown[]) => void): void;
};
export type SolWallet = { id: "phantom" | "solflare"; name: string; provider: () => SolProvider | undefined; install: string; browse: (url: string) => string };

const w = () => window as unknown as { phantom?: { solana?: SolProvider & { isPhantom?: boolean } }; solflare?: SolProvider & { isSolflare?: boolean } };
export const SOL_WALLETS: SolWallet[] = [
  { id: "phantom", name: "Phantom", provider: () => w().phantom?.solana, install: "https://phantom.com/download",
    browse: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}` },
  { id: "solflare", name: "Solflare", provider: () => w().solflare, install: "https://solflare.com/download",
    browse: (url) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}` },
];

const conns = new Map<SolanaCluster, Connection>();
export function connection(c: SolanaCluster): Connection {
  if (!conns.has(c)) conns.set(c, new Connection(SOLANA_RPC[c], "confirmed"));
  return conns.get(c)!;
}

export const isMint = (s: string) => { try { return PublicKey.isOnCurve(new PublicKey(s).toBytes()) || new PublicKey(s).toBase58() === s; } catch { return false; } };
export const shortKey = (s: string) => (s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);
export const explorerTx = (sig: string, c: SolanaCluster) => `https://solscan.io/tx/${sig}${c === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerToken = (mint: string, c: SolanaCluster) => `https://solscan.io/token/${mint}${c === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAccount = (a: string, c: SolanaCluster) => `https://solscan.io/account/${a}${c === "devnet" ? "?cluster=devnet" : ""}`;

export type MintFacts = { supply: bigint; decimals: number; mintAuthority: string | null; freezeAuthority: string | null };
export async function readMint(c: SolanaCluster, mint: string): Promise<MintFacts | null> {
  const info = await connection(c).getParsedAccountInfo(new PublicKey(mint));
  const parsed = (info.value?.data as { parsed?: { info?: { supply: string; decimals: number; mintAuthority: string | null; freezeAuthority: string | null } } })?.parsed?.info;
  if (!parsed) return null;
  return { supply: BigInt(parsed.supply), decimals: parsed.decimals, mintAuthority: parsed.mintAuthority ?? null, freezeAuthority: parsed.freezeAuthority ?? null };
}

export async function topHolders(c: SolanaCluster, mint: string) {
  const r = await connection(c).getTokenLargestAccounts(new PublicKey(mint));
  return r.value.map((v) => ({ address: v.address.toBase58(), amount: BigInt(v.amount) }));
}

export async function recentSignatures(c: SolanaCluster, address: string, limit = 15) {
  const r = await connection(c).getSignaturesForAddress(new PublicKey(address), { limit });
  return r.map((s) => ({ sig: s.signature, time: s.blockTime ?? null, ok: !s.err }));
}

export async function walletTokens(c: SolanaCluster, owner: string) {
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const r = await connection(c).getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: TOKEN_PROGRAM_ID });
  return r.value
    .map((a) => { const i = (a.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString: string } } } }).parsed.info; return { mint: i.mint, amount: BigInt(i.tokenAmount.amount), decimals: i.tokenAmount.decimals, ui: i.tokenAmount.uiAmountString }; })
    .filter((t) => t.amount > 0n);
}

export async function solBalance(c: SolanaCluster, owner: string) {
  return BigInt(await connection(c).getBalance(new PublicKey(owner)));
}
