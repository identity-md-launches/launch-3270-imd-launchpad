import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ethConfig } from "./wallet/eth";
import { SolanaProvider } from "./solctx";
import { App } from "./App";
import "./styles.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={ethConfig}>
      <QueryClientProvider client={qc}>
        <SolanaProvider><App /></SolanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
