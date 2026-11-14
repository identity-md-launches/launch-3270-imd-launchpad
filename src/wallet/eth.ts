import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { ETH_RPC, SITE_NAME } from "../config";

/** Ethereum mainnet: IMD payments, rewards and burns. No relay and no project ID (wallet-connectors guide). */
export const ethConfig = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
  transports: { [mainnet.id]: http(ETH_RPC) },
});
