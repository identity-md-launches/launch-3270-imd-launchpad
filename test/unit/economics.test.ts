import { describe, expect, it } from "vitest";
import { assessRisk, buildMetadata, buildSwarmBody, emptyForm, minOut, PIMD, PIMD_SPLIT, MAX_RESERVE_BPS, REVENUE_SPLIT, reserveBps, siteLabel, solToLamports, splitAmount, sumBps, validateToken } from "../../src/lib/economics";
import { actionId, encodeBody, jobIdFromIntake } from "../../src/lib/imd";
import { IMD_INTAKE, IMD_TOKEN, SWARM_FEE_WEI } from "../../src/config";
import { encodeFunctionData, decodeFunctionData, hexToString } from "viem";
import { INTAKE_ABI, NO_CALLBACK } from "../../src/lib/imd";

describe("splits", () => {
  it("revenue split is 25/20/20/20/15 and sums to 100%", () => {
    expect(REVENUE_SPLIT.map((s) => s.bps)).toEqual([2500, 2000, 2000, 2000, 1500]);
    expect(sumBps(REVENUE_SPLIT)).toBe(10000);
  });
  it("PIMD split matches the brief and reserves stay within 70%", () => {
    expect(PIMD.supply).toBe(1_000_000_000);
    expect(PIMD_SPLIT.map((s) => s.bps)).toEqual([3000, 3000, 2000, 1000, 1000]);
    expect(sumBps(PIMD_SPLIT)).toBe(10000);
    expect(reserveBps(PIMD_SPLIT)).toBeLessThanOrEqual(MAX_RESERVE_BPS);
  });
  it("splitAmount conserves every unit", () => {
    const parts = splitAmount(1_000_001n, REVENUE_SPLIT);
    expect(parts.reduce((a, b) => a + b.amount, 0n)).toBe(1_000_001n);
    expect(parts[4].amount).toBe(150_000n);
  });
  it("minOut applies slippage", () => { expect(minOut(10_000n, 100)).toBe(9_900n); });
});

describe("token form", () => {
  it("requires name and ticker and rejects bad links", () => {
    const e = validateToken({ ...emptyForm, website: "javascript:alert(1)" });
    expect(e.name).toBeTruthy(); expect(e.symbol).toBeTruthy(); expect(e.website).toBeTruthy();
  });
  it("accepts a valid token", () => {
    expect(validateToken({ ...emptyForm, name: "Harbor Cat", symbol: "HCAT", image: "https://x.io/a.png", initialBuySol: "0.5" })).toEqual({});
  });
  it("caps the initial buy at the curve target", () => {
    expect(validateToken({ ...emptyForm, name: "A", symbol: "A", initialBuySol: "100" }).initialBuySol).toBeTruthy();
  });
  it("converts SOL to lamports exactly", () => {
    expect(solToLamports("0.1")).toBe(100_000_000n);
    expect(solToLamports("1.000000001")).toBe(1_000_000_001n);
    expect(() => solToLamports("1e3")).toThrow();
  });
  it("builds Metaplex metadata with socials", () => {
    const m = buildMetadata({ ...emptyForm, name: " Cat ", symbol: "cat", x: "https://x.com/cat" }, "ipfs://img.png");
    expect(m).toMatchObject({ name: "Cat", symbol: "CAT", image: "ipfs://img.png", extensions: { twitter: "https://x.com/cat" } });
  });
});

describe("risk", () => {
  it("flags live authorities as high risk", () => { expect(assessRisk({ mintAuthority: "abc", freezeAuthority: null }).level).toBe("high"); });
  it("revoked authorities and spread holders are low risk", () => { expect(assessRisk({ mintAuthority: null, freezeAuthority: null, topHolderPct: 3, top10Pct: 20 }).level).toBe("low"); });
});

describe("IMD Swarm request", () => {
  it("pads the action id to 32 bytes", () => {
    const a = actionId("job.open");
    expect(a.length).toBe(66);
    expect(hexToString(a, { size: 32 })).toBe("job.open@job-1");
  });
  it("encodes a request call that pays exactly 0.5 IMD", () => {
    const body = buildSwarmBody("website", "A site for a harbour cat token.", { name: "Harbor Cat", symbol: "hcat" });
    expect(body.skill).toBe("build-website");
    expect(body.ipfs).toBe("harbor-cat");
    const data = encodeFunctionData({ abi: INTAKE_ABI, functionName: "request", args: [actionId("job.open"), encodeBody(body), NO_CALLBACK, IMD_TOKEN, SWARM_FEE_WEI] });
    const d = decodeFunctionData({ abi: INTAKE_ABI, data });
    expect(d.args[4]).toBe(500000000000000000n);
    expect(d.args[3].toLowerCase()).toBe(IMD_TOKEN);
    expect(JSON.parse(hexToString(d.args[1] as `0x${string}`))).toEqual(body);
    expect(IMD_INTAKE).toBe("0xa43e6f75ee006411f79ac1c84120606c2330de82");
  });
  it("site labels follow IMD's label rules", () => {
    expect(siteLabel("  My Cool Token!! ")).toBe("my-cool-token");
    expect(siteLabel("x".repeat(40)).length).toBeLessThanOrEqual(32);
  });
  it("reads the job id from an intake answer", () => {
    expect(jobIdFromIntake({ entries: [{ state: "admitted", admission: { result: { jobId: "j1" } } }] })).toBe("j1");
    expect(jobIdFromIntake(null)).toBeNull();
  });
});
