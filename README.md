# MoonLauncher

Launch a coin on pump.fun. Type a theme. The service makes the name, the
symbol, the text, and the image. Your wallet signs one transaction. The coin
is live.

## What it does

Three services, three slugs:

1. **Custom launch** (`/launch/custom`) — 0.15 SOL flat. The customer writes
   the name, the symbol, and the text, and uploads the image. The service
   pins it to IPFS and builds the launch transaction.
2. **Boost** (`/launch/boost`) — 25% of the deposit. The customer gives
   any pump.fun coin address and deposits SOL (0.5–50). Up to 1000 service
   wallets buy the coin in small bursts. All tokens move to the customer's
   wallet. The deposit covers buys + network costs; the service keeps 25%.
3. **AI launch** (`/launch/ai`) — 0.25 / 0.75 / 1.75 SOL. MiniMax makes the
   name, symbol, description, and image. Atomic launch, optional boost with
   100 or 250 wallets.

Non-custodial everywhere: the customer's wallet signs every payment; the
service holds no customer funds.

## Swarm wallets

Boost wallets are derived deterministically from one 32-byte secret:

```
SWARM_SEED=<base64 of 32 random bytes>
```

Wallet *i* = `Keypair.fromSeed(sha256(seed || u32le(i)))`, 1000 wallets.
They start empty — each burst call tops up its batch from the treasury out
of the customer's deposit (treasury pays buys + gas and keeps the 25%
margin by construction). No pre-funding, no env-size problem.

## Boost economics (per wallet, mainnet-measured)

| Item | SOL | Retrievable? |
| --- | --- | --- |
| Buy tx fee | 0.000005 | No — burned |
| ATA rent (170 B Token-2022) | 0.00204 | Yes — returned on close |
| Consolidation tx fee | 0.000005 | No — burned |
| Funding tx fee (amortized ÷6) | 0.0000008 | No — burned |
| Sweep slop + buffer dust | ~0.000089 | Yes, via later dust sweeps |

- True unrecoverable cost: **≈ 0.000011 SOL/wallet** (network fees).
- The "network costs" line (0.0022/wallet) is almost fully recycled:
  treasury fronts rent + buffer, consolidation closes ATAs and sweeps
  ~0.0021 back. Net gas line ≈ +0.0001/wallet.
- The 25% margin **never leaves the treasury**: the customer deposits the
  calculated price, only (buys + gas) is distributed, the rest stays.
- Example: 1000 wallets × 0.001 SOL → price 4.267 SOL → into the coin 1.0,
  gas 2.2 (mostly recycled), treasury nets **≈ 1.14 SOL**
  (1.067 margin + ~0.09 gas surplus − 0.011 burn).
- The 1% pump.fun curve fee on each buy is the customer's cost, embedded in
  the token price; it does not touch the treasury either way.

Wallet sets are derived per mint (`sha256(seed‖mint‖i)`) — every job gets a
fresh, unique set of addresses; no cross-job fingerprint on-chain.

## AI launch tiers

| Tier | Price | Contents |
| --- | --- | --- |
| Ignition | 0.25 SOL | AI identity, atomic launch, first buy 0.02 SOL |
| Boost | 0.75 SOL | Ignition + 100 wallets, tokens to your wallet |
| Moonshot | 1.75 SOL | Boost + 250 wallets, featured on the front page |

The launch transaction carries 0.25 SOL of fee. Boost tiers pay the rest
(0.5 / 1.5 SOL) as a separate transfer, verified on-chain.

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (base-ui)
- @solana/web3.js — v0 transactions, partial signing (server signs the mint,
  browser signs the payment)
- MiniMax `image-01` for images, `MiniMax-M3` for text
- pump.fun `/api/ipfs` for metadata hosting
- Boost progress is derived from the chain (which swarm ATAs exist). No
  database.

## Environment

Copy the example and fill it in. Server-only vars must not use the
`NEXT_PUBLIC_` prefix.

```
# .env.local
RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
NEXT_PUBLIC_RPC_URL=...            # same URL, for the browser
TREASURY_SECRET_B64=...            # base64 of the 64-byte treasury keypair
NEXT_PUBLIC_TREASURY=...           # treasury pubkey (also fine without the secret on read-only deploys)
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.io/v1
NEXT_PUBLIC_SITE_URL=https://moonlauncher.app
SWARM_WALLETS=["<base64 secret>", ...]   # boost wallets, see below
GH_TOKEN=...                       # optional: launches feed via GitHub contents API
GH_REPO=owner/name
```

`SWARM_WALLETS` / `SWARM_WALLETS_N` (JSON arrays of base64 secrets) are
still read as a fallback when `SWARM_SEED` is absent.

## Tests

```
npm test
```

The test suite pins the pump.fun instruction layouts against live mainnet
launches (PDA derivations, 18-slot buy account map, quote math, encoding).

## Run

```
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it in Vercel. Framework preset: Next.js.
3. Set the environment variables above (Production + Preview).
4. Note: `/api/prepare` and `/api/confirm` need up to 60 s. On Hobby plans,
   raise the function limit for those routes (or keep them under 10 s by
   pre-generating the identity through `/api/identity` before `/api/prepare`).

## Risks and notes

- pump.fun program accounts can change (mayhem_state slot, fee recipients).
  The prepare route self-heals through simulation; if the program changes
  layout, update `lib/constants.ts` from a live template transaction.
- Boost wallets hold no customer funds. All buys are self-paid.
- This is a tool, not financial advice. All payments are final.

## Public API v1 (swarm/boost only)

Payment is the auth — no wallet connection server-side. Every order is
validated on-chain: exact lamports to the treasury + a unique memo reference.

```
POST /v1/swarm/quote          { perBuySol, buys } → price + breakdown
POST /v1/swarm/orders         { mint, customer, perBuySol, buys, callbackUrl? }
                              → order { id, deposit: {address, lamports, memo} }
GET  /v1/swarm/orders/:id     → state + progress (awaiting_payment|buying|
                              consolidating|done|expired)
```

Auth: `x-api-key` header (keys in `SWARM_API_KEYS="key:name,…"`, 60/min/key).
Pay the order with a System transfer to `deposit.address` of exactly
`deposit.lamports` lamports plus a memo-program instruction containing
`deposit.memo`. The tick detects it (30 min expiry). Webhooks: HMAC-SHA256
(`x-moonlauncher-signature`, signed with your API key) POSTed to
`callbackUrl` on every state change.

## Telegram bot

Group wizard: `/swarm <coin address>` → recipient address → inline buy-size
and wallet-count pickers → payment block (address + memo + exact amount).
`/price <perBuy> <buys>` for quotes, `/status <orderId>` for progress.
Progress posts edit in-place in the group.

Setup: create a bot with BotFather, then

```
npx vercel env add TELEGRAM_BOT_TOKEN production
npx vercel env add TG_WEBHOOK_SECRET production
TG_TOKEN=… TG_SECRET=… ./scripts/tg-set-webhook.sh
```

## Job engine + ticks

Swarm jobs live in the KV store (`lib/store.ts`: Vercel KV/Upstash when
`KV_REST_API_URL`/`KV_REST_API_TOKEN` are set, memory in dev). **Production
requires the KV integration** (Vercel dashboard → Marketplace → Upstash
Redis, free tier) — without it each serverless instance has its own memory
and jobs will not resolve across instances.

Drivers (any of them advance jobs; advance is idempotent + throttled):
- `scripts/swarm-tick-loop.sh` — this box, every 60 s
- `.github/workflows/swarm-tick.yml` — GitHub Actions, every 5 min
- `POST /api/boost/jobs/:id/advance` — browsers/API/bot, throttled 10 s

## Notes

- Analytics: GA4 (G-3V70FNBL8R) via `components/gtag.tsx`; conversion
  events on connect/identity/launch/boost/swarm buttons (`lib/gtag.ts`).
- React 19: the app currently pins React 18 (wallet-adapter + base-ui
  compatibility). To upgrade: `npm i next@latest react@^19 react-dom@^19`
  then re-test the wallet modal and launch flow end-to-end.
