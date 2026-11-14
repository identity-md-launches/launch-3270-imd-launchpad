# IMD Launchpad

A Solana token launchpad powered by IMD Swarm: create a token on a Raydium LaunchLab bonding curve in one step, trade it, track it, and pay 0.5 IMD on Ethereum for IMD Swarm's AI workers to build the project. This upgrades the existing site at imd-launchpad-idea-in-ecosy-6a3e.imd.site and keeps its tokens, colors, favicon, og image and copy. Target name: imd-launchpad.imd.site.

`dist/` is the committed static export (relative URLs, hash routing). The publisher serves it as is.

## Install, preview, rebuild

```
npm ci              # Node 20+
npm run dev         # local dev server
npm run build       # tsc --noEmit, then vite build into dist/
npm run preview     # serve dist/ locally
npm test            # vitest: logic and DOM interaction tests
```

Commit `dist/` after every rebuild.

## What it does

| Area | How it works | Source |
| --- | --- | --- |
| Quick launch | Name, ticker, image, optional socials and first buy, then Create and launch. Metadata JSON is generated from the form. One signing step in Phantom or Solflare creates the mint and the LaunchLab curve (`createLaunchpad`, standard SOL config, 6 decimals, AMM migration) with the optional first buy. | `src/views/Home.tsx`, `src/lib/launchlab.ts` |
| Build with Swarm | Pick a deliverable (complete project, website, branding, game, app, marketing, X/Telegram), describe it, see the exact request, connect an Ethereum wallet, approve exactly 0.5 IMD to Intakev2, call `request(job.open@job-1, …)`. Then the site polls `/intake/1/<tx>` for the job id, `/jobs/<id>` for progress and `/jobs/<id>/result` for files, and offers "Build the next version" (`job.continue`). | `src/views/Swarm.tsx`, `src/lib/imd.ts` |
| Trading | Token page: curve price, market cap, raised SOL and progress read from the LaunchLab pool every 15 s; buy/sell with slippage (`buyToken`/`sellToken`); graduated tokens link to Raydium and embed the DexScreener chart. | `src/views/Token.tsx` |
| Discovery | Trending (DexScreener boosts), New (latest profiles), Launched here, search by name, ticker or mint. | `src/views/Discover.tsx`, `src/lib/dexscreener.ts` |
| Token data | Holders (`getTokenLargestAccounts`), risk indicators (mint/freeze authority, concentration, liquidity, age), live activity (pool signatures), share and post to X, notes. | `src/views/Token.tsx`, `src/lib/economics.ts` |
| Portfolio | SOL and SPL balances of the connected wallet, watchlist, trading history, notifications (optionally browser notifications), creator profiles. | `src/views/Portfolio.tsx` |
| PIMD | Name, ticker, 1,000,000,000 supply, 30/30/20/10/10 split, 70% reserve cap with vesting, timelock and multisig plan, LaunchLab compatibility notes. Not deployed. | `src/views/Pimd.tsx` |
| Revenue and burns | 25/20/20/20/15 split calculator on eligible net revenue; live IMD total supply and dead-address balance from Ethereum; treasury multisig and developer wallet shown once set. | `src/views/Rewards.tsx` |
| Workers | Live seat performance from `api.imd.fun/swarm`; NFT verification reads `balanceOf` and `ownerOf` on the identity.md collection. | `src/views/Rewards.tsx` |

## Verified infrastructure (read 2026-11-14)

- IMD on Ethereum: `0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7`; Intakev2: `0xa43e6f75ee006411f79ac1c84120606c2330de82`; treasury payTo `0x4e0fa57bde726079356537e2f34d671e9f41adbc`; price `500000000000000000` (0.5 IMD). Sources: `https://api.imd.fun/requests/capabilities`, `https://api.imd.fun/openapi.json`, `https://imd.fun/skill/onchain.md`.
- identity.md NFT collection: `0x0000ec93127baa929e58e97dd0095a2bfb38ec1d` (`https://api.imd.fun/health`).
- Raydium LaunchLab programs come from `@raydium-io/raydium-sdk-v2` (`LAUNCHPAD_PROGRAM`, `DEV_LAUNCHPAD_PROGRAM`).
- Solana RPC: public devnet and mainnet-beta endpoints. Ethereum RPC: publicnode. Wallets: Phantom and Solflare (injected providers, open-in links on phones); Ethereum by EIP-6963 plus Coinbase Smart Wallet, no relay and no project ID.

## Owner settings: needed before production

All in `src/config.ts` under `OWNER`. Each is empty and its feature says so; nothing is invented.

1. `developerImdWallet`: your **public** Ethereum wallet for the 15% developer IMD accumulation. Please send it.
2. `treasuryMultisig`: the Safe that will hold the ecosystem treasury and run buybacks and burns.
3. `solanaFeeReceiver`: a public Solana address to receive LaunchLab share fees as platform revenue.
4. `metadataUploadUrl`: an endpoint of yours that pins metadata to IPFS or Arweave. Until it's set, the form generates the metadata file for you to host and paste.
5. `pimdApproved`: stays `false`. PIMD is not deployed and no mainnet transaction runs without your approval.
6. A dedicated Solana mainnet RPC URL (`SOLANA_RPC.mainnet`) is recommended; the public one is rate-limited.

Never send a private key or seed phrase. The site doesn't need one.

## Security

Non-custodial. Every launch, trade, approval and payment is signed in the visitor's wallet. The IMD approval is for exactly 0.5 IMD, never unlimited. The only key the site generates is the fresh mint keypair, which signs its own creation and is discarded. LaunchLab revokes mint and freeze authority, so there are no hidden token privileges. Mainnet launches need an explicit "real SOL" confirmation, and Devnet is the default.

## Validation (run on this machine)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | Passed, no errors |
| Production build | `npm run build` | Passed: dist is 1.8 MB (index 863 kB, Raydium chunk 772 kB) |
| Logic tests | `npx vitest run` (`test/unit/economics.test.ts`) | 15 passed: splits sum to 100% and conserve units, PIMD split and 70% cap, form validation, exact lamports, metadata, risk, Intake calldata decodes to 0.5 IMD with the right token and body, site labels, intake job id |
| Interaction tests | `npx vitest run` (`test/unit/ui.test.tsx`, happy-dom, mocked fetch) | 7 passed: first screen has h1 and Create and launch; form validation then review step; Solana sheet opens and closes on Escape; hash routing to every view; Discover tabs, search and watchlist; Swarm live figures and the exact `job.open@job-1` body; revenue split amounts |
| Design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | **Did not run.** The sandbox refuses to bind a local port (`listen EPERM 127.0.0.1`). A copy patched to serve files through Playwright routing also failed: headless Chromium closes at launch in this sandbox. No screenshots or rendered measurements exist. |

A bug the tests found and that is fixed: a search started from the "Launched here" tab was overwritten by the trending fetch (`src/views/Discover.tsx:41-60`, now a separate `search` state).

Not performed here: live signing (no wallet extension on this machine), Devnet launch and trade, a mainnet Swarm payment (not authorised), and any rendered check at 320, 390 or 1440 wide. Before mainnet, launch and trade one token on Devnet with Phantom.

## Better Interface review

Coverage: the guide's contents and its accessibility core principles were read. The six domains were applied while building and reviewed in source only ("without a browser" checks). Rendered checks (contrast measurement, zoom, screen-reader walk, layout at each width) were not performed because no browser could run.

- **Accessibility**: native buttons, links, radios and selects; every input has a label; errors use `aria-invalid` + `aria-describedby` and focus the first invalid field (`src/views/Home.tsx:56-60`); dialogs have `aria-modal`, a labelled title, Escape and backdrop close (`src/solctx.tsx:70-95`); skip link; `:focus-visible` 2px lime ring; progress bar and tabs carry roles and state; the route change moves focus to `main` (`src/App.tsx:26`).
- **Layout**: mobile first, product and main action in the first screen, 72rem wrap, grid collapses to one column, long addresses wrap (`src/styles.css` `.mono-wrap`), nav scrolls sideways.
- **Writing**: six-word headline plus one line; directions next to controls; errors say what to do; no em dashes, no all-caps, no slogan stacks.
- **Typography**: six sizes, three weights, tabular numbers for figures, balanced headings.
- **Colors**: existing palette kept; status colors pair with text ("Confirmed", "+5.2%", risk words), never color alone.
- **UI**: 44px controls (36px small), 48px sheet rows, press feedback with a reduced-motion fallback, disabled and pending states on every signing control, skeleton rows while loading.

Findings fixed during review: the search-tab bug above; Swarm `body` typed so `job.continue` carries `parentJobId` (`src/views/Swarm.tsx:99`).

Remaining limitations:
- Comments and discussion are kept in the visitor's browser. Shared, moderated threads and livestreaming need a backend service the owner chooses; a static export can't host either.
- Notifications are in-app (and optional browser notifications while the tab is open), not push.
- The Swarm free check (`POST /requests/check`) and capabilities endpoints refuse browser origins, so the fee shown comes from the verified config; the Intake contract itself enforces the price (`PriceNotMet`).
- Revenue distribution, buybacks and burns run from the owner's multisig. The dashboard reads chain state but executes nothing.
- The open-in marks for MetaMask, Rabby, Phantom and Solflare are brand-colored dots, not the official marks.
- Sizes: the main bundle is 863 kB (262 kB gzip). The Raydium SDK loads only when a token page or launch needs it.
