import { stringToHex, toHex, type Address } from "viem";
import { IMD_API } from "../config";

/** Intakev2 ABI: only the function the site calls. Source: imd.fun/skill/onchain.md. */
export const INTAKE_ABI = [
  {
    type: "function", name: "request", stateMutability: "nonpayable",
    inputs: [
      { name: "action", type: "bytes32" },
      { name: "body", type: "bytes" },
      { name: "callback", type: "tuple", components: [{ name: "target", type: "address" }, { name: "selector", type: "bytes4" }] },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "requestId", type: "bytes32" }],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const ERC721_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

/** "job.open@job-1" right-padded to 32 bytes, as the intake expects. */
export function actionId(action: "job.open" | "job.continue"): `0x${string}` {
  return toHex(`${action}@job-1`, { size: 32 });
}
export const NO_CALLBACK = { target: "0x0000000000000000000000000000000000000000" as Address, selector: "0x00000000" as `0x${string}` };
export const encodeBody = (body: object) => stringToHex(JSON.stringify(body));

async function get<T>(path: string): Promise<T | null> {
  const r = await fetch(`${IMD_API}${path}`, { headers: { accept: "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`IMD API ${r.status}`);
  return r.json() as Promise<T>;
}

export type SwarmStats = {
  at: number;
  health: { agentsOnline: number; workingNow: number; acceptedLastDay: number; jobsDoneLastDay: number; seatsEnrolled: number; verifierUp: boolean; publisherUp: boolean };
  counts: { jobs: number; launchesLive: number; sites: number; tasksInProgress: number };
  seats: Record<string, { tokenId: number; attempts: number; accepted: number; rejected: number; failed: number; pending: number; last: string; working: boolean }>;
};
export const fetchSwarm = () => get<SwarmStats>("/swarm");

export type IntakeEntry = { state: string; reason?: string; admission?: { result?: { jobId?: string } } };
export const fetchIntake = (chainId: number, tx: string) => get<{ entries: IntakeEntry[] }>(`/intake/${chainId}/${tx}`);

export type JobNode = { id?: string; title?: string; skill?: string; state?: string };
export type Job = {
  id: string; state: string; objective?: string; blockedReason?: string | null; paidBy?: string | null;
  nodes?: JobNode[]; delivery?: { repoUrl?: string; pullRequestUrl?: string; site?: { url?: string } } | null;
  site?: { url?: string; ens?: string; gatewayUrl?: string } | null;
  project?: { id: string; head?: string; versions?: { jobId: string; state: string }[] } | null;
};
export const fetchJob = (id: string) => get<Job>(`/jobs/${encodeURIComponent(id)}`);
export type JobResult = { state: string; complete: boolean; files?: { name: string; path: string; url: string; bytes: number; mediaType: string }[]; delivery?: Record<string, unknown> };
export const fetchJobResult = (id: string) => get<JobResult>(`/jobs/${encodeURIComponent(id)}/result`);

export const jobIdFromIntake = (r: { entries: IntakeEntry[] } | null) => r?.entries?.[0]?.admission?.result?.jobId ?? null;
export const isTerminal = (state?: string) => state === "completed" || state === "blocked" || state === "cancelled";
