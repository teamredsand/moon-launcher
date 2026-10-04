# MoonLauncher

Launch a coin on pump.fun. Type a theme. The service makes the name, the
symbol, the text, and the image. Your wallet signs one transaction. The coin
is live.

## What it does

1. **Identity.** An AI model (MiniMax) makes the name, the symbol, the
   description, and the image. The image and metadata go to IPFS through
   pump.fun's own upload API.
2. **Launch.** One transaction creates the coin, buys the first tokens, and
   pays the service fee. The customer's wallet signs it. The service holds no
   funds.
3. **Boost (paid option).** Up to 250 service wallets buy the coin in small
   steps. All tokens then move to the customer's wallet. The customer
   controls the supply.

## Tiers

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

`SWARM_WALLETS` is a JSON array of base64-encoded 64-byte keypair secrets.
Each wallet needs at least 0.004 SOL to pay for one buy plus fees and rent.
Refill them from the treasury when they run dry. See `scripts/` for helpers.

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
