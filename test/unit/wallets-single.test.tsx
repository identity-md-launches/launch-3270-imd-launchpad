// @vitest-environment happy-dom
// Only Rabby installed, on Base, owning window.ethereum with isMetaMask set. Plus pure detection rules.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { disconnect, getConnections } from "wagmi/actions";
import { ethConfig } from "../../src/wallet/eth";
import { SolanaProvider } from "../../src/solctx";
import { App } from "../../src/App";
import { addressKind, connectorFor, otherConnectors, walletOf } from "../../src/wallet/detect";
import { RB, announce, fakeFetch, fakeWallet, makeChain, memStorage, methods, type FakeWallet } from "./wallet-fakes";

const fc = makeChain();
let rabby: FakeWallet;
beforeAll(() => {
  rabby = fakeWallet(fc, RB, { isMetaMask: true, isRabby: true, chainId: "0x2105" });
  (window as unknown as { ethereum: unknown }).ethereum = rabby;
  announce("io.rabby", "Rabby Wallet", rabby);
});
beforeEach(() => { vi.stubGlobal("localStorage", memStorage); memStorage.clear(); vi.stubGlobal("fetch", fakeFetch(fc)); });
afterEach(async () => {
  await act(async () => { for (const c of getConnections(ethConfig)) await disconnect(ethConfig, { connector: c.connector }).catch(() => {}); });
  cleanup(); vi.unstubAllGlobals();
});
function mount(hash = "#/") {
  location.hash = hash;
  return render(<WagmiProvider config={ethConfig}><QueryClientProvider client={new QueryClient()}><SolanaProvider><App /></SolanaProvider></QueryClientProvider></WagmiProvider>);
}
const ethGroup = () => within(screen.getByRole("dialog", { name: "Connect wallet" })).getByRole("region", { name: /Ethereum/ });

describe("only Rabby installed", () => {
  it("never offers Rabby's provider as MetaMask, even though it claims isMetaMask", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await waitFor(() => expect(within(ethGroup()).getByRole("button", { name: /^Rabby Wallet/ })).toBeTruthy());
    const mm = within(ethGroup()).getByRole("link", { name: /Install MetaMask/ });
    expect(mm.getAttribute("href")).toBe("https://metamask.io/download/");
    expect(within(ethGroup()).queryByRole("button", { name: /^MetaMask/ })).toBeNull();
    expect(methods(rabby)).not.toContain("eth_requestAccounts");
  });
  it("on the wrong network offers only the switch, then reads Ethereum Mainnet", async () => {
    mount("#/swarm");
    fireEvent.click(screen.getAllByRole("button", { name: "Connect MetaMask or Rabby" })[0]);
    fireEvent.click(await within(ethGroup()).findByRole("button", { name: /^Rabby Wallet/ }));
    await waitFor(() => expect(within(ethGroup()).getByText("Wrong network: Base")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Build with IMD Swarm/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Build with IMD Swarm/ })).toBeTruthy());
    const sw = rabby.request.mock.calls.find((c) => c[0].method === "wallet_switchEthereumChain");
    expect(sw?.[0].params).toEqual([{ chainId: "0x1" }]);
  });
});

describe("detection rules", () => {
  const cs = [{ id: "io.rabby", type: "injected" }, { id: "io.metamask", type: "injected" }, { id: "app.phantom", type: "injected" }, { id: "injected", type: "injected" }, { id: "coinbaseWalletSDK", type: "coinbaseWallet" }];
  it("maps wallets by EIP-6963 rdns only", () => {
    expect(connectorFor(cs, "metamask")?.id).toBe("io.metamask");
    expect(connectorFor(cs, "rabby")?.id).toBe("io.rabby");
    expect(connectorFor([{ id: "injected", type: "injected" }], "metamask")).toBeUndefined();
    expect(walletOf("io.rabby")).toBe("rabby");
    expect(walletOf("injected")).toBeNull();
    expect(otherConnectors(cs).map((c) => c.id)).toEqual(["app.phantom", "coinbaseWalletSDK"]);
  });
  it("tells Ethereum and Solana addresses apart", () => {
    expect(addressKind("0x1111111111111111111111111111111111111111")).toBe("ethereum");
    expect(addressKind("7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2")).toBe("solana");
    expect(addressKind("0x123")).toBeNull();
    expect(addressKind("not an address")).toBeNull();
  });
});
