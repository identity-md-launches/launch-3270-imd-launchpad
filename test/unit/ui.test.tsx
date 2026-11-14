// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ethConfig } from "../../src/wallet/eth";
import { SolanaProvider } from "../../src/solctx";
import { App } from "../../src/App";

const pair = (sym: string) => ({ chainId: "solana", dexId: "raydium", url: "https://dexscreener.com/solana/p" + sym, pairAddress: "p" + sym, baseToken: { address: "So11111111111111111111111111111111111111112", name: sym + " Token", symbol: sym }, marketCap: 1_500_000, volume: { h24: 20_000 }, priceChange: { h24: 5.2 }, liquidity: { usd: 50_000 } });

function mount(hash = "#/") {
  location.hash = hash;
  return render(
    <WagmiProvider config={ethConfig}><QueryClientProvider client={new QueryClient()}><SolanaProvider><App /></SolanaProvider></QueryClientProvider></WagmiProvider>,
  );
}

// Node 25 ships its own half-enabled localStorage global; give the tests a plain in-memory Storage.
const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };

beforeEach(() => {
  vi.stubGlobal("localStorage", storage);
  storage.clear();
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    const url = String(u);
    const body = url.includes("token-boosts") || url.includes("token-profiles") ? [{ chainId: "solana", tokenAddress: "So11111111111111111111111111111111111111112" }]
      : url.includes("/tokens/v1/") ? [pair("CAT")]
      : url.includes("/latest/dex/search") ? { pairs: [pair("DOG")] }
      : url.includes("api.imd.fun/swarm") ? { at: 1, health: { agentsOnline: 1040, workingNow: 1, acceptedLastDay: 9, jobsDoneLastDay: 12, seatsEnrolled: 1084, verifierUp: true, publisherUp: true }, counts: { jobs: 1, launchesLive: 1, sites: 774, tasksInProgress: 1 }, seats: { "2": { tokenId: 2, attempts: 10, accepted: 9, rejected: 1, failed: 0, pending: 0, last: "2026-11-14T00:00:00Z", working: false } } }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("launch page", () => {
  it("shows the product and its main action first", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Idea in. Ecosystem out." })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Create and launch" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Build with Swarm/ })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("CAT").length).toBeGreaterThan(0));
  });
  it("validates the form before asking for a signature", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Create and launch" }));
    expect(await screen.findByText("Enter a token name.")).toBeTruthy();
    expect(screen.getByText("Enter a ticker.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Harbor Cat" } });
    fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "hcat" } });
    expect((screen.getByLabelText("Ticker") as HTMLInputElement).value).toBe("HCAT");
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "https://example.org/cat.png" } });
    fireEvent.change(screen.getByLabelText("Metadata link"), { target: { value: "ipfs://bafy/meta.json" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and launch" }));
    expect(await screen.findByRole("heading", { name: "Review and sign" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect to launch" })).toBeTruthy();
  });
  it("opens the Solana wallet sheet and closes it with Escape", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("dialog", { name: "Connect a Solana wallet" })).toBeTruthy();
    expect(screen.getByText(/Phantom/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("navigation and discovery", () => {
  it("routes by hash and switches tabs, search and watchlist", async () => {
    mount("#/discover");
    expect(await screen.findByRole("heading", { level: 1, name: "Discover tokens" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("CAT")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Launched here" }));
    expect(screen.getByText(/Tokens you launch from this browser/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Search by name/), { target: { value: "dog" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("DOG")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    expect(JSON.parse(localStorage.getItem("imd-launchpad:watch")!)).toEqual(["So11111111111111111111111111111111111111112"]);
  });
  it("renders every top-level view", async () => {
    for (const [hash, title] of [["#/swarm", "Build with Swarm"], ["#/pimd", "Pump IMD (PIMD)"], ["#/rewards", "Revenue, burns and workers"], ["#/portfolio", "Portfolio"]] as const) {
      const v = mount(hash);
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
      v.unmount();
    }
  });
});

describe("swarm and rewards", () => {
  it("shows live swarm figures and the exact paid request", async () => {
    mount("#/swarm?name=Harbor%20Cat&symbol=HCAT");
    await waitFor(() => expect(screen.getByText("1,040")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Describe the project"), { target: { value: "A cat-themed community token for harbour towns." } });
    fireEvent.click(screen.getByRole("radio", { name: /^Website/ }));
    const pre = document.querySelector("pre.code")!.textContent!;
    expect(JSON.parse(pre)).toMatchObject({ action: "job.open@job-1", body: { skill: "build-website", ipfs: "harbor-cat" } });
    expect(screen.getAllByRole("button", { name: "Connect Ethereum wallet" }).length).toBeGreaterThan(0);
  });
  it("fills the continue field when an in-app link adds ?parent= to #/swarm", async () => {
    mount("#/swarm");
    await screen.findByLabelText("Continue an earlier job (optional)");
    act(() => { location.hash = "#/swarm?parent=job_abc123"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    await waitFor(() => expect((screen.getByLabelText("Continue an earlier job (optional)") as HTMLInputElement).value).toBe("job_abc123"));
    const pre = JSON.parse(document.querySelector("pre.code")!.textContent!);
    expect(pre.action).toBe("job.continue@job-1");
  });
  it("offers the image file picker on the thumbnail", async () => {
    mount();
    const picker = await screen.findByLabelText("Preview a file");
    expect((picker as HTMLInputElement).type).toBe("file");
  });
  it("splits revenue as the brief specifies", async () => {
    mount("#/rewards");
    const input = await screen.findByLabelText("Eligible net platform revenue (USD)");
    await act(async () => { fireEvent.change(input, { target: { value: "1000" } }); });
    expect(screen.getByText("25% · $250")).toBeTruthy();
    expect(screen.getByText("15% · $150")).toBeTruthy();
  });
});
