# IMD Launchpad design system

Taken from the final source (`src/styles.css`, `src/App.tsx`, `src/views/*`). The color, type, spacing and radius tokens are the same ones the existing export at imd-launchpad-idea-in-ecosy-6a3e.imd.site uses, so the upgrade keeps its look. The favicon and og image are the original files.

## Colors (`:root` in `src/styles.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#0c0f14` (gray-950) | Page background, inputs |
| `--color-surface` | `#141922` (gray-900) | Cards, token rows, sheets |
| `--color-surface-raised` | `#1c2230` (gray-850) | Buttons, chips |
| `--color-surface-hover` | `#242b3a` (gray-800) | Sheet row hover |
| `--color-border` | `#2e3646` (gray-700) | Card and input borders, dividers |
| `--color-text` | `#eef1f6` (gray-50) | Body text |
| `--color-text-secondary` | `#a1abbc` (gray-400) | Muted text, hints, labels in facts |
| `--color-accent` / hover | `#b8f25c` / `#cdf78a` (lime) | Primary actions, links, focus ring, progress |
| `--color-on-accent` | `#0c0f14` | Text on lime |
| `--color-error` | `#ff9e92` (coral) | Errors, price down, high risk |
| `--color-warning` | `#f5c86b` (amber) | Mainnet banner, medium risk, running jobs |
| `--color-success` | `#7fd9c0` (teal) | Price up, low risk, completed jobs |
| `--violet-300` | `#b9a7ff` | Fifth series in split bars |

Dark only (`color-scheme: dark`). Split bars use lime, teal, amber, coral, violet in order (`.bar-0` to `.bar-4`).

## Typography

- Family: system UI stack (`--font-sans`); `--font-mono` only for the raw request JSON (`.code`). Weights 400, 600, 700.
- Scale, six sizes: `--text-sm` .875rem, `--text-base` 1rem, `--text-lg` 1.125rem, `--text-xl` 1.5rem, `--text-2xl` 2rem, `--text-display` 2.5rem (3.5rem from 60rem wide).
- h1 display, line-height 1.05, tracking -0.035em. Page titles `--text-xl` (2xl from 60rem), -0.02em. h2 `--text-lg`. h3 `--text-base` 600.
- Numbers use `font-variant-numeric: tabular-nums` (`.num`). No all-caps, no positive tracking, no eyebrow labels.

## Spacing, radius, motion

- Spacing: `--space-1` .25rem to `--space-20` 5rem (1, 2, 3, 4, 6, 8, 12, 20). Gutter 1rem, 1.5rem from 40rem, 2rem from 60rem. Content max 72rem.
- Radius: controls 8px, cards 14px, pills 999px.
- Motion: buttons transition background, border, color and a 0.96 press scale over 150ms `cubic-bezier(.2,0,0,1)`; the scale is removed under reduced motion. No endless animation, no `transition: all`.

## Components

- **Header**: brand (favicon mark + name; under 30rem only the mark shows and the name stays in the accessible name), Solana network select (Devnet default), notification bell with unread badge, Solana Connect. Under it a horizontally scrollable nav: Launch, Discover, Swarm, PIMD, Rewards, Portfolio; `aria-current` marks the page with a 2px lime underline (`inset 0 -2px 0 var(--color-accent)`), the same indicator as `.tab`.
- **Mainnet banner**: amber line under the header whenever Mainnet is selected.
- **Buttons**: `.button` (raised), `.button-primary` (lime), `.button-quiet` (transparent), `.button-small` (36px), `.button-wide`; 44px minimum height. `.link-button` for inline actions; `.icon-button` 44px square (watchlist star, `aria-pressed`).
- **Fields**: label above input, hint and error below, `aria-invalid` + `aria-describedby`, coral border on error, first invalid field focused on submit.
- **Launch card**: name + ticker (two columns), image link whose 44px thumbnail is also the file picker (empty state shows a plus glyph, focus ring via `:focus-within`, input labelled "Preview a file"), first buy, collapsible description and socials, metadata link with "Download metadata file", then Create and launch / Build with Swarm. States: form, review and sign (facts list), signing, error, done.
- **Token row**: thumbnail, symbol and name (both truncate with an ellipsis; the list and rows have `min-inline-size:0` so a long ticker can't widen the page), market cap, 24h volume (hidden under 40rem), 24h change (teal/coral), star.
- **Tabs**: underline tabs with `role=tab` and `aria-selected`.
- **Stats / facts**: 2-column (4 from 40rem) stat grid; label/value fact rows with dividers.
- **Progress bar**: 10px lime bar with `role=progressbar` for the bonding curve.
- **Segmented control**: Buy / Sell with `aria-pressed`.
- **Choice cards**: radio cards for Swarm deliverables; checked card gets a lime border.
- **Split list + bar**: colored dot, label and note, percentage and amount.
- **Wallet sheets**: fixed backdrop, bottom sheet under 40rem and centred above, max 420px, 48px rows with 28px marks, × close, Escape and backdrop close, per-row pending text, one-line failure note.
- **Job tracker**: state pill, objective, step list, result files, explorer links, "Build the next version".

## Responsive behavior

- Mobile first. At 390 wide the first screen shows the header, the headline "Idea in. Ecosystem out.", one line, and the Create a token form with its first fields.
- From 60rem the hero becomes two columns (copy left, launch card right, 32rem); token, Swarm, PIMD, Rewards and Portfolio pages become a 1.6fr / 1fr grid.
- Steps: 1 column, 2 from 40rem, 4 from 60rem. Swarm choices: 1 column, 2 from 40rem. Social fields: 1 column, 3 from 40rem.
- Long values (mints, addresses) wrap with `overflow-wrap:anywhere`; token symbols and names truncate with an ellipsis; under 40rem the hero's bottom padding drops from 32px to 16px so Create and launch stays on the first screen at 390×844; nav scrolls sideways rather than wrapping.
