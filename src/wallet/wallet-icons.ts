/** Marks for rows wagmi carries no icon for. Coinbase is the official mark; the others use each brand's colour. */
const coinbase = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" fill="#2C5FF6"/><path fill-rule="evenodd" clip-rule="evenodd" d="M14 23.8C19.4124 23.8 23.8 19.4124 23.8 14C23.8 8.58761 19.4124 4.2 14 4.2C8.58761 4.2 4.2 8.58761 4.2 14C4.2 19.4124 8.58761 23.8 14 23.8ZM11.55 10.8C11.1358 10.8 10.8 11.1358 10.8 11.55V16.45C10.8 16.8642 11.1358 17.2 11.55 17.2H16.45C16.8642 17.2 17.2 16.8642 17.2 16.45V11.55C17.2 11.1358 16.8642 10.8 16.45 10.8H11.55Z" fill="white"/></svg>`;
const dot = (bg: string, fg = "white") => `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" rx="7" fill="${bg}"/><circle cx="14" cy="14" r="6" fill="${fg}"/></svg>`;
export const WALLET_ICONS: Record<string, string> = {
  coinbaseWalletSDK: coinbase,
  coinbase,
  metamask: dot("#F6851B"),
  rabby: dot("#7084FF"),
  phantom: dot("#AB9FF2"),
  solflare: dot("#FC7227", "#0c0f14"),
  injected: dot("#2e3646", "#b8f25c"),
};
export const iconSrc = (id: string) => (WALLET_ICONS[id] ? `data:image/svg+xml;utf8,${encodeURIComponent(WALLET_ICONS[id])}` : undefined);
