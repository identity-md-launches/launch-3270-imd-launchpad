/**
 * Which wallet is which. MetaMask and Rabby are told apart only by the reverse-DNS id each
 * extension announces over EIP-6963 (wagmi uses it as the connector id). `window.ethereum` is never
 * used to pick between them: Rabby sets `isMetaMask` on it for compatibility, so a flag check would
 * connect the wrong wallet whenever both are installed.
 */
export type EthWalletId = "metamask" | "rabby";
export type SolWalletId = "phantom" | "solflare";

export const ETH_WALLETS: ReadonlyArray<{ id: EthWalletId; name: string; rdns: readonly string[]; install: string }> = [
  { id: "metamask", name: "MetaMask", rdns: ["io.metamask"], install: "https://metamask.io/download/" },
  { id: "rabby", name: "Rabby Wallet", rdns: ["io.rabby"], install: "https://rabby.io/" },
];

/** Every rdns that belongs to a named row, so the "other wallets" list never repeats one. */
export const NAMED_RDNS = new Set(ETH_WALLETS.flatMap((w) => w.rdns));

type ConnectorLike = { id: string; type: string };

/** The EIP-6963 connector for one named wallet, or undefined when that extension did not announce itself. */
export function connectorFor<C extends ConnectorLike>(connectors: readonly C[], id: EthWalletId): C | undefined {
  const w = ETH_WALLETS.find((x) => x.id === id);
  if (!w) return undefined;
  return connectors.find((c) => c.type === "injected" && w.rdns.includes(c.id));
}

/** The named wallet a connector belongs to, if any. */
export function walletOf(connectorId: string | undefined): EthWalletId | null {
  if (!connectorId) return null;
  return ETH_WALLETS.find((w) => w.rdns.includes(connectorId))?.id ?? null;
}

/** EIP-6963 wallets that are not one of the named rows (Coinbase Wallet extension, Brave, Phantom's EVM side). */
export function otherConnectors<C extends ConnectorLike>(connectors: readonly C[]): C[] {
  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  return connectors.filter((c) => !NAMED_RDNS.has(c.id) && !(c.id === "injected" && named));
}

// ---- Address kinds: an Ethereum address is never shown or used as a Solana one, and the reverse.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isEthAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
export const isSolAddress = (s: string) => BASE58.test(s);
export function addressKind(s: string): "ethereum" | "solana" | null {
  const v = s.trim();
  if (isEthAddress(v)) return "ethereum";
  if (isSolAddress(v)) return "solana";
  return null;
}

export const shortEth = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const ETH_CHAIN_NAMES: Record<number, string> = { 1: "Ethereum Mainnet", 10: "OP Mainnet", 56: "BNB Chain", 137: "Polygon", 8453: "Base", 42161: "Arbitrum One", 11155111: "Sepolia" };
export const chainName = (id: number | undefined) => (id == null ? "Unknown network" : ETH_CHAIN_NAMES[id] ?? `Chain ${id}`);
