// @vitest-environment happy-dom
// MetaMask and Rabby both installed (Rabby also owning window.ethereum with isMetaMask set), plus Phantom and Solflare.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { disconnect, getConnections } from "wagmi/actions";
import { decodeFunctionData, hexToString } from "viem";
import { ethConfig } from "../../src/wallet/eth";
import { SolanaProvider } from "../../src/solctx";
import { App } from "../../src/App";
import { ERC20_ABI, INTAKE_ABI } from "../../src/lib/imd";
import { IMD_INTAKE, IMD_TOKEN } from "../../src/config";
import { MM, RB, PHANTOM_KEY, SOLFLARE_KEY, announce, fakeFetch, fakeSol, fakeWallet, makeChain, memStorage, methods, type FakeWallet } from "./wallet-fakes";

const fc = makeChain();
let metamask: FakeWallet, rabby: FakeWallet, phantom: ReturnType<typeof fakeSol>, solflare: ReturnType<typeof fakeSol>;

beforeAll(() => {
  metamask = fakeWallet(fc, MM, { isMetaMask: true });
  rabby = fakeWallet(fc, RB, { isMetaMask: true, isRabby: true });
  (window as unknown as { ethereum: unknown }).ethereum = rabby; // Rabby takes window.ethereum and claims isMetaMask
  announce("io.metamask", "MetaMask", metamask);
  announce("io.rabby", "Rabby Wallet", rabby);
});
beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage);
  memStorage.clear();
  vi.stubGlobal("fetch", fakeFetch(fc));
  phantom = fakeSol(PHANTOM_KEY); solflare = fakeSol(SOLFLARE_KEY);
  Object.assign(window, { phantom: { solana: phantom }, solflare });
  metamask.request.mockClear(); rabby.request.mockClear();
});
afterEach(async () => {
  await act(async () => { for (const c of getConnections(ethConfig)) await disconnect(ethConfig, { connector: c.connector }).catch(() => {}); });
  cleanup(); vi.unstubAllGlobals();
});

function mount(hash = "#/") {
  location.hash = hash;
  return render(<WagmiProvider config={ethConfig}><QueryClientProvider client={new QueryClient()}><SolanaProvider><App /></SolanaProvider></QueryClientProvider></WagmiProvider>);
}
const sheet = () => screen.getByRole("dialog", { name: "Connect wallet" });
const ethGroup = () => within(sheet()).getByRole("region", { name: /Ethereum/ });
const solGroup = () => within(sheet()).getByRole("region", { name: /Solana/ });

describe("both Ethereum extensions installed", () => {
  it("lists MetaMask and Rabby separately, by their EIP-6963 ids", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(within(ethGroup()).getByRole("button", { name: /^MetaMask/ })).toBeTruthy());
    expect(within(ethGroup()).getByRole("button", { name: /^Rabby Wallet/ })).toBeTruthy();
    expect(within(solGroup()).getByRole("button", { name: /^Phantom/ })).toBeTruthy();
    expect(within(solGroup()).getByRole("button", { name: /^Solflare/ })).toBeTruthy();
    // Nothing connects by itself.
    expect(methods(metamask)).not.toContain("eth_requestAccounts");
    expect(methods(rabby)).not.toContain("eth_requestAccounts");
  });

  it("MetaMask opens only MetaMask, Rabby only Rabby, and switching ends the first session", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    fireEvent.click(await within(ethGroup()).findByRole("button", { name: /^MetaMask/ }));
    await waitFor(() => expect(within(ethGroup()).getByText("0x1111111111111111111111111111111111111111")).toBeTruthy());
    expect(methods(metamask)).toContain("eth_requestAccounts");
    expect(methods(rabby)).not.toContain("eth_requestAccounts");
    expect(within(ethGroup()).getByText("Ethereum Mainnet")).toBeTruthy();
    await waitFor(() => expect(within(ethGroup()).getByText("2")).toBeTruthy()); // IMD balance from balanceOf
    await waitFor(() => expect(within(ethGroup()).getByText("0.1")).toBeTruthy()); // ETH balance

    fireEvent.click(within(ethGroup()).getByRole("button", { name: /Use Rabby Wallet instead/ }));
    await waitFor(() => expect(within(ethGroup()).getByText("0x2222222222222222222222222222222222222222")).toBeTruthy());
    expect(methods(rabby)).toContain("eth_requestAccounts");
    expect(within(ethGroup()).queryByText("0x1111111111111111111111111111111111111111")).toBeNull();

    fireEvent.click(within(ethGroup()).getByRole("button", { name: "Disconnect Rabby Wallet" }));
    await waitFor(() => expect(within(ethGroup()).getByRole("button", { name: /^Rabby Wallet/ })).toBeTruthy());
    expect(within(ethGroup()).getByRole("button", { name: /^MetaMask/ })).toBeTruthy();
  });

  it("holds an Ethereum and a Solana wallet at once and keeps their addresses apart", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    fireEvent.click(await within(ethGroup()).findByRole("button", { name: /^MetaMask/ }));
    await waitFor(() => expect(within(ethGroup()).getByText(MM)).toBeTruthy());
    fireEvent.click(within(solGroup()).getByRole("button", { name: /^Phantom/ }));
    await waitFor(() => expect(within(solGroup()).getByText(PHANTOM_KEY)).toBeTruthy());
    expect(within(solGroup()).getByText("Solana Devnet")).toBeTruthy();
    expect(within(ethGroup()).queryByText(PHANTOM_KEY)).toBeNull();
    expect(within(solGroup()).queryByText(MM)).toBeNull();
    expect(screen.getByRole("button", { name: new RegExp(`Wallets: Ethereum ${MM}, Solana ${PHANTOM_KEY}`) })).toBeTruthy();
    // Switching Solana wallets leaves the Ethereum one alone.
    fireEvent.click(within(solGroup()).getByRole("button", { name: /Use Solflare instead/ }));
    await waitFor(() => expect(within(solGroup()).getByText(SOLFLARE_KEY)).toBeTruthy());
    expect(phantom.disconnect).toHaveBeenCalled();
    expect(within(ethGroup()).getByText(MM)).toBeTruthy();
    fireEvent.click(within(solGroup()).getByRole("button", { name: "Disconnect Solflare" }));
    await waitFor(() => expect(within(solGroup()).getByRole("button", { name: /^Solflare/ })).toBeTruthy());
    expect(within(ethGroup()).getByText(MM)).toBeTruthy();
  });

  it("pays a Swarm job: fee from Intakev2, exact approval, request, IMD API verification, job progress, no double charge", async () => {
    mount("#/swarm");
    fireEvent.change(await screen.findByLabelText("Describe the project"), { target: { value: "A cat-themed community token for harbour towns." } });
    fireEvent.click(screen.getAllByRole("button", { name: "Connect MetaMask or Rabby" })[0]);
    fireEvent.click(await within(ethGroup()).findByRole("button", { name: /^MetaMask/ }));
    await waitFor(() => expect(within(ethGroup()).getByText(MM)).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("0.5 IMD, read from IMD Intakev2")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/about 0\.00005 ETH gas for the approval/)).toBeTruthy());
    fireEvent.click(screen.getByRole("checkbox", { name: /I've checked the brief/ }));
    const pay = await screen.findByRole("button", { name: "Build with IMD Swarm: approve, then pay" });
    await act(async () => { fireEvent.click(pay); fireEvent.click(pay); }); // a double click sends one flow
    await waitFor(() => expect(screen.getByText("Payment verified by the IMD API. Job admitted.")).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByText("job_test_1")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("1 of 2 steps")).toBeTruthy());

    expect(fc.chain.sent.length).toBe(2);
    expect(fc.chain.sent.every((t) => t.from.toLowerCase() === MM)).toBe(true);
    const appr = decodeFunctionData({ abi: ERC20_ABI, data: fc.chain.sent[0].data as `0x${string}` });
    expect(fc.chain.sent[0].to.toLowerCase()).toBe(IMD_TOKEN);
    expect(appr.args).toEqual([expect.stringMatching(new RegExp(IMD_INTAKE, "i")), 500000000000000000n]);
    const req = decodeFunctionData({ abi: INTAKE_ABI, data: fc.chain.sent[1].data as `0x${string}` });
    expect(fc.chain.sent[1].to.toLowerCase()).toBe(IMD_INTAKE);
    expect(req.functionName).toBe("request");
    expect(req.args![4]).toBe(500000000000000000n);
    expect(JSON.parse(hexToString(req.args![1] as `0x${string}`)).objective).toContain("harbour towns");
    expect(rabby.request.mock.calls.some((c) => c[0].method === "eth_sendTransaction")).toBe(false);

    // The same brief again: blocked until the visitor ticks "Pay again".
    expect(screen.getByRole("checkbox", { name: /You already paid for this exact brief/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Build with IMD Swarm: pay 0.5 IMD" })); });
    expect(screen.getByRole("alert").textContent).toMatch(/already paid for this exact brief/);
    expect(fc.chain.sent.length).toBe(2);
  }, 20000);
});

describe("network and fee safety", () => {
  it("stops before any signature when the intake's fee differs from 0.5 IMD", async () => {
    fc.chain.fee = 700000000000000000n;
    try {
      mount("#/swarm");
      await waitFor(() => expect(screen.getByText(/won't pay a different amount/)).toBeTruthy());
    } finally { fc.chain.fee = 500000000000000000n; }
  });
});
