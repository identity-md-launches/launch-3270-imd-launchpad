import { vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, toFunctionSelector } from "viem";
import { ERC20_ABI } from "../../src/lib/imd";

export const MM = "0x1111111111111111111111111111111111111111";
export const RB = "0x2222222222222222222222222222222222222222";
export const PHANTOM_KEY = "7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2";
export const SOLFLARE_KEY = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const pad = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
const SEL = { balanceOf: "0x70a08231", allowance: "0xdd62ed3e", approve: "0x095ea7b3", totalSupply: "0x18160ddd", ownerOf: "0x6352211e",
  priceOf: toFunctionSelector("priceOf(bytes32,address)"), request: toFunctionSelector("request(bytes32,bytes,(address,bytes4),address,uint256)") };

/** A pretend Ethereum mainnet: balances, the intake's fee, receipts. Shared by the wallets and the site's RPC. */
export function makeChain(opts: { fee?: bigint } = {}) {
  const chain = { allowance: 0n, fee: opts.fee ?? 500000000000000000n, sent: [] as { from: string; to: string; data: string }[], txs: new Set<string>() };
  async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
    switch (method) {
      case "eth_chainId": return "0x1";
      case "net_version": return "1";
      case "eth_blockNumber": return "0x100";
      case "eth_getBalance": return "0x16345785d8a0000"; // 0.1 ETH
      case "eth_gasPrice": return "0x3b9aca00"; // 1 gwei
      case "eth_maxPriorityFeePerGas": return "0x1";
      case "eth_estimateGas": return "0xc350"; // 50,000
      case "eth_getBlockByNumber": return { number: "0x100", baseFeePerGas: "0x3b9aca00", hash: "0x" + "00".repeat(32), timestamp: "0x1", transactions: [] };
      case "eth_getTransactionCount": return "0x0";
      case "eth_call": {
        const { data = "" } = params[0] as { data?: string };
        const sel = data.slice(0, 10);
        if (sel === "0x82ad56cb") { // Multicall3 aggregate3: wagmi batches reads through it
          const { args } = decodeFunctionData({ abi: multicall3Abi, data: data as `0x${string}` });
          const calls = (args as unknown as [{ target: string; callData: string }[]])[0];
          const out = await Promise.all(calls.map(async (c) => {
            const r = (await rpc("eth_call", [{ to: c.target, data: c.callData }])) as `0x${string}`;
            return { success: r !== "0x", returnData: r };
          }));
          return encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: out });
        }
        if (sel === "0x4d2301cc") return pad(100000000000000000n); // Multicall3 getEthBalance: 0.1 ETH
        if (sel === SEL.balanceOf) return pad(2000000000000000000n); // 2 IMD
        if (sel === SEL.allowance) return pad(chain.allowance);
        if (sel === SEL.totalSupply) return pad(10n ** 27n);
        if (sel === SEL.priceOf) return pad(chain.fee);
        if (sel === SEL.request) return pad(1n);
        if (sel === SEL.ownerOf) return pad(BigInt(MM));
        return "0x";
      }
      case "eth_getTransactionReceipt": case "eth_getTransactionByHash": {
        const h = params[0] as string;
        if (!chain.txs.has(h)) return null;
        return { transactionHash: h, hash: h, status: "0x1", blockNumber: "0xff", blockHash: "0x" + "11".repeat(32), logs: [], gasUsed: "0xc350", cumulativeGasUsed: "0xc350", effectiveGasPrice: "0x3b9aca00", from: MM, to: null, transactionIndex: "0x0", type: "0x2", contractAddress: null, logsBloom: "0x" + "00".repeat(256), input: "0x", nonce: "0x0", value: "0x0", gas: "0xc350" };
      }
      default: throw Object.assign(new Error(`unsupported ${method}`), { code: -32601 });
    }
  }
  return { chain, rpc };
}
export type FakeChain = ReturnType<typeof makeChain>;

/** An EIP-1193 provider as an extension injects it. `isMetaMask` is set on Rabby too, as Rabby does. */
export function fakeWallet(fc: FakeChain, address: string, opts: { chainId?: string; isMetaMask?: boolean; isRabby?: boolean } = {}) {
  let chainId = opts.chainId ?? "0x1";
  let connected = false;
  const ls: Record<string, ((...a: unknown[]) => void)[]> = {};
  const emit = (ev: string, v: unknown) => (ls[ev] ?? []).forEach((f) => f(v));
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    switch (method) {
      case "eth_requestAccounts": connected = true; return [address];
      case "eth_accounts": return connected ? [address] : [];
      case "eth_chainId": return chainId;
      case "wallet_requestPermissions": connected = true; return [{ parentCapability: "eth_accounts" }];
      case "wallet_revokePermissions": connected = false; return null;
      case "wallet_switchEthereumChain": chainId = (params![0] as { chainId: string }).chainId; emit("chainChanged", chainId); return null;
      case "eth_sendTransaction": {
        const tx = params![0] as { from: string; to: string; data: string };
        fc.chain.sent.push(tx);
        if (tx.data.startsWith(SEL.approve)) fc.chain.allowance = decodeFunctionData({ abi: ERC20_ABI, data: tx.data as `0x${string}` }).args![1] as bigint;
        const h = "0x" + (fc.chain.sent.length).toString(16).padStart(64, "a");
        fc.chain.txs.add(h);
        return h;
      }
      default: return fc.rpc(method, params);
    }
  });
  return { request, isMetaMask: opts.isMetaMask, isRabby: opts.isRabby, on: (ev: string, f: (...a: unknown[]) => void) => { (ls[ev] ??= []).push(f); }, removeListener: (ev: string, f: (...a: unknown[]) => void) => { ls[ev] = (ls[ev] ?? []).filter((x) => x !== f); } };
}
export type FakeWallet = ReturnType<typeof fakeWallet>;
export const methods = (w: FakeWallet) => w.request.mock.calls.map((c) => c[0].method);

export function announce(rdns: string, name: string, provider: unknown) {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: { uuid: crypto.randomUUID(), name, rdns, icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" }, provider }) }));
}

export function fakeSol(key: string) {
  let on = false;
  return { get publicKey() { return on ? { toBase58: () => key } : null; }, connect: vi.fn(async () => { on = true; }), disconnect: vi.fn(async () => { on = false; }), signAllTransactions: vi.fn(), on: vi.fn() };
}

/** fetch: Ethereum JSON-RPC goes to the fake chain; the IMD API answers with an admitted job. */
export function fakeFetch(fc: FakeChain) {
  return vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u instanceof Request ? u.url : u);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (process.env.DBG) console.log("FETCH", url, String(init?.body ?? "").slice(0, 160));
    if (url.includes("publicnode") || url.includes("solana.com")) {
      const req = JSON.parse(String(init?.body));
      if (url.includes("solana.com")) return json({ jsonrpc: "2.0", id: req.id, result: { context: { slot: 1 }, value: 1500000000 } });
      const one = async (r: { id: number; method: string; params: unknown[] }) => { try { return { jsonrpc: "2.0", id: r.id, result: await fc.rpc(r.method, r.params) }; } catch (e) { return { jsonrpc: "2.0", id: r.id, error: { code: -32601, message: (e as Error).message } }; } };
      return json(Array.isArray(req) ? await Promise.all(req.map(one)) : await one(req));
    }
    if (url.includes("api.imd.fun/intake/")) return json({ entries: [{ state: "admitted", admission: { result: { jobId: "job_test_1" } } }] });
    if (url.includes("api.imd.fun/jobs/job_test_1")) return json({ id: "job_test_1", state: "executing", nodes: [{ id: "a", title: "Build the site", state: "completed" }, { id: "b", title: "Review", state: "running" }] });
    if (url.includes("api.imd.fun/swarm")) return json({ at: 1, health: { agentsOnline: 1040, workingNow: 1, acceptedLastDay: 9, jobsDoneLastDay: 12, seatsEnrolled: 1084, verifierUp: true, publisherUp: true }, counts: { jobs: 1, launchesLive: 1, sites: 774, tasksInProgress: 1 }, seats: {} });
    return json([]);
  });
}

const mem = new Map<string, string>();
export const memStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
