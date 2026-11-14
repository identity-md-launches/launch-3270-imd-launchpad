/**
 * The site's single configuration file. Every address here was read from an official source on
 * 2026-11-14 (see README "Verified infrastructure"). Owner settings are empty until the owner
 * discloses them; the features that need them stay disabled and say so. Nothing here is secret.
 */
export const SITE_NAME = "IMD Launchpad";
export const SITE_DESCRIPTION = "Launch a Solana token in one step, trade it, and build the project with IMD Swarm.";
export const SITE_URL = "https://imd-launchpad.imd.site/";
export const SITE_ICON_URL = "https://imd-launchpad.imd.site/favicon.svg";

// ---- Solana -------------------------------------------------------------------------------
export type SolanaCluster = "devnet" | "mainnet";
export const SOLANA_RPC: Record<SolanaCluster, string> = {
  devnet: "https://api.devnet.solana.com",
  // Public endpoint, rate-limited. Owners should set a dedicated RPC (Helius, Triton, QuickNode) here.
  mainnet: "https://api.mainnet-beta.solana.com",
};
export const DEFAULT_CLUSTER: SolanaCluster = "devnet";
export const TOKEN_DECIMALS = 6; // LaunchLab default for mint A
export const LAUNCHLAB_SUPPLY = 1_000_000_000; // LaunchLab default supply, whole tokens
export const DEFAULT_SLIPPAGE_BPS = 100; // 1%

// ---- Ethereum: IMD and the Swarm intake ----------------------------------------------------
export const ETH_CHAIN_ID = 1;
export const ETH_RPC = "https://ethereum-rpc.publicnode.com";
export const IMD_API = "https://api.imd.fun";
export const IMD_EXPLORER = "https://explorer.imd.fun";
/** IMD on Ethereum mainnet (imd.fun/skill/onchain.md, api.imd.fun/requests/capabilities). */
export const IMD_TOKEN = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7" as const;
/** Intakev2, the official onchain payment door for Swarm jobs. Same address on every chain. */
export const IMD_INTAKE = "0xa43e6f75ee006411f79ac1c84120606c2330de82" as const;
/** The treasury the intake forwards payments to (payTo in capabilities). Shown, never paid directly. */
export const IMD_PAY_TO = "0x4e0fa57bde726079356537e2f34d671e9f41adbc" as const;
/** 0.5 IMD, 18 decimals: the official price of one Swarm request. */
export const SWARM_FEE_WEI = 500000000000000000n;
export const IMD_DECIMALS = 18;
/** identity.md NFT collection (api.imd.fun/health identity.collection): one seat per NFT. */
export const IMD_NFT_COLLECTION = "0x0000ec93127baa929e58e97dd0095a2bfb38ec1d" as const;
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

// ---- Owner settings: empty until the owner discloses them ----------------------------------
export const OWNER = {
  /** The developer's public Ethereum wallet for the 15% IMD accumulation share. */
  developerImdWallet: "" as `0x${string}` | "",
  /** Safe multisig holding the IMD ecosystem treasury share. */
  treasuryMultisig: "" as `0x${string}` | "",
  /** Solana fee receiver for LaunchLab share fees (platform revenue), a public address. */
  solanaFeeReceiver: "",
  /** POST endpoint that pins metadata JSON + image (the owner's own pinning function). Empty: download and paste. */
  metadataUploadUrl: "",
  /** PIMD stays undeployed until the owner approves it in writing. */
  pimdApproved: false,
};
