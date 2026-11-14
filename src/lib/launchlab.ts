/**
 * Raydium LaunchLab: token creation on a bonding curve, buys and sells, and pool reads.
 * The SDK is loaded on demand so the first screen stays light. Every transaction is built here
 * and signed in the visitor's own wallet; the site holds no keys except the fresh mint keypair,
 * which only signs its own creation and is discarded.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { SolanaCluster } from "../config";
import { DEFAULT_SLIPPAGE_BPS, OWNER, TOKEN_DECIMALS } from "../config";
import { connection, type SolProvider } from "./solana";

const sdk = () => import("@raydium-io/raydium-sdk-v2");
export const WSOL = new PublicKey("So11111111111111111111111111111111111111112");

async function programId(c: SolanaCluster) {
  const m = await sdk();
  return c === "devnet" ? m.DEV_LAUNCHPAD_PROGRAM : m.LAUNCHPAD_PROGRAM;
}

async function load(c: SolanaCluster, wallet: SolProvider) {
  const m = await sdk();
  const owner = new PublicKey(wallet.publicKey!.toBase58());
  return m.Raydium.load({
    connection: connection(c), cluster: c === "devnet" ? "devnet" : "mainnet", owner,
    signAllTransactions: (txs) => wallet.signAllTransactions(txs),
    disableLoadToken: true, disableFeatureCheck: true,
  });
}

export type PoolState = {
  poolId: string; status: number; graduated: boolean; creator: string;
  priceSol: number; progress: number; raisedSol: number; targetSol: number; soldTokens: number; tokensOnCurve: number;
};

export async function readPool(c: SolanaCluster, mint: string): Promise<PoolState | null> {
  const m = await sdk();
  const pid = await programId(c);
  const poolId = m.getPdaLaunchpadPoolId(pid, new PublicKey(mint), WSOL).publicKey;
  const acc = await connection(c).getAccountInfo(poolId);
  if (!acc) return null;
  const p = m.LaunchpadPool.decode(acc.data);
  const decA = Number(p.mintDecimalsA ?? TOKEN_DECIMALS);
  const vA = Number(p.virtualA.toString()), vB = Number(p.virtualB.toString());
  const rA = Number(p.realA.toString()), rB = Number(p.realB.toString());
  const priceSol = ((vB + rB) / 1e9) / ((vA - rA) / 10 ** decA);
  const target = Number(p.totalFundRaisingB.toString());
  return {
    poolId: poolId.toBase58(), status: Number(p.status), graduated: Number(p.status) > 0, creator: p.creator.toBase58(),
    priceSol, progress: target ? Math.min(1, rB / target) : 0, raisedSol: rB / 1e9, targetSol: target / 1e9,
    soldTokens: rA / 10 ** decA, tokensOnCurve: Number(p.totalSellA.toString()) / 10 ** decA,
  };
}

/** Create the token and its curve in one signing step, with an optional first buy. Returns the mint and signatures. */
export async function createToken(c: SolanaCluster, wallet: SolProvider, t: { name: string; symbol: string; uri: string; buyLamports: bigint }) {
  const m = await sdk();
  const raydium = await load(c, wallet);
  const pid = await programId(c);
  const mintKp = Keypair.generate();
  const configId = m.getPdaLaunchpadConfigId(pid, WSOL, 0, 0).publicKey;
  const cfgAcc = await connection(c).getAccountInfo(configId);
  if (!cfgAcc) throw new Error("LaunchLab's standard SOL curve config was not found on this network.");
  const configInfo = m.LaunchpadConfig.decode(cfgAcc.data);
  const buy = t.buyLamports > 0n;
  const fee = OWNER.solanaFeeReceiver ? { shareFeeReceiver: new PublicKey(OWNER.solanaFeeReceiver) } : {};
  const { execute, extInfo } = await raydium.launchpad.createLaunchpad({
    programId: pid, mintA: mintKp.publicKey, decimals: TOKEN_DECIMALS, name: t.name, symbol: t.symbol, uri: t.uri,
    migrateType: "amm", configId, configInfo, mintBDecimals: 9,
    txVersion: m.TxVersion.V0, slippage: new BN(DEFAULT_SLIPPAGE_BPS),
    buyAmount: new BN((buy ? t.buyLamports : 1n).toString()), createOnly: !buy, extraSigners: [mintKp], ...fee,
  });
  const sent = await execute({ sequentially: true });
  return { mint: mintKp.publicKey.toBase58(), poolId: extInfo.address.poolId.toBase58(), signatures: sent.txIds };
}

export async function trade(c: SolanaCluster, wallet: SolProvider, mint: string, side: "buy" | "sell", amount: bigint, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  const m = await sdk();
  const raydium = await load(c, wallet);
  const pid = await programId(c);
  const base = { programId: pid, mintA: new PublicKey(mint), slippage: new BN(slippageBps), txVersion: m.TxVersion.V0 };
  const fee = OWNER.solanaFeeReceiver ? { shareFeeReceiver: new PublicKey(OWNER.solanaFeeReceiver) } : {};
  const r = side === "buy"
    ? await raydium.launchpad.buyToken({ ...base, ...fee, buyAmount: new BN(amount.toString()) })
    : await raydium.launchpad.sellToken({ ...base, ...fee, sellAmount: new BN(amount.toString()) });
  const { txId } = await r.execute({ sendAndConfirm: true });
  return txId;
}
