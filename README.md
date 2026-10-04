# MoonLauncher

Launch a coin on pump.fun. Type a theme. The service makes the name, the
symbol, the text, and the image. Your wallet signs one transaction. The coin
is live.

## What it does

Three services, three slugs:

1. **Custom launch** (`/launch/custom`) — 0.15 SOL flat. The customer writes
   the name, the symbol, and the text, and uploads the image. The service
   pins it to IPFS and builds the launch transaction.
2. **Swarm buy** (`/launch/boost`) — 25% of the deposit. The customer gives
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
