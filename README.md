# DLMM LP Copilot

LP Copilot is a judg## Environment Setup
Devnet defaults live in the root `.env` (shared) and each package's `.env`.

```bash
# Root (shared defaults)
cp .env .env.local

# Strategy service
cp services/strategy/.env services/strategy/.env.local
# edit to set SOLANA_RPC_URL, BOT_USERNAME (for deep links), MOCK_MODE

# Telegram bot
cp apps/bot/.env apps/bot/.env.local
# set TELEGRAM_BOT_TOKEN, ALLOWLIST_IDS, DEFAULT_WALLET (linked wallet)

# Web app (Next.js)
cp apps/web/.env apps/web/.env.local
# ensures NEXT_PUBLIC_STRATEGY_URL=http://localhost:4000 etc.
```stack for Saros Finance's Dynamic Liquidity Market Maker (DLMM). It combines a browser dashboard, a strategy API, and a Telegram bot so liquidity providers can rebalance bands, stage advanced orders, and monitor positions from anywhere.

## What We Built
- **Strategy Rebalancer** – calculates target bands, executes mock transactions, and exposes REST endpoints.
- **Advanced Orders** – plan/arm/disarm limit & stop orders with SDK-driven bin selection.
- **Telegram Companion** – one-tap wallet linking to reuse the same wallet for chat commands.
- **Analytics & Backtests** – CSV-driven simulator to explore “what-if” rebalancing strategies.

## Architecture
```mermaid
flowchart LR
    subgraph Client
        Web[Next.js 14 Web App]
        Telegram[Telegram Bot (Telegraf)]
    end
    subgraph Services
        Strategy[Fastify Strategy Service]
    end
    subgraph Core SDK
        Core[@dlmm-copilot/core\n + @saros-finance/dlmm-sdk]
    end
    Solana[(Solana Devnet)]

    Web -->|REST /bot/*, /rebalance/*| Strategy
    Telegram -->|REST /bot/*| Strategy
    Strategy -->|DLMM SDK| Core
    Core --> Solana
```

## Key SDKs & Libraries
- [`@saros-finance/dlmm-sdk`](https://www.npmjs.com/package/@saros-finance/dlmm-sdk) for pool math and positions.
- [`@solana/web3.js`](https://solana-labs.github.io/solana-web3.js) for wallet validation & RPC calls.
- [`fastify`](https://fastify.io/), [`telegraf`](https://telegraf.js.org/), [`next`](https://nextjs.org/), [`zod`](https://zod.dev/).

## Safety & MOCK_MODE
The repo defaults to **MOCK_MODE=true**. All rebalance/advanced order executions return deterministic `MOCK-` transaction IDs. Wallets are validated with Solana base58 rules; in mock mode the literal `WALLET_MOCK` maps to `11111111111111111111111111111111`. Switch to live mode by setting `MOCK_MODE=false` in `services/strategy/.env.local` and supplying a real RPC + wallet signer.

## Environment Setup
Devnet defaults live in the root `.env` (shared) and each package’s `.env`.

```bash
# Root (shared defaults)
cp .env .env.local

# Strategy service
cp services/strategy/.env services/strategy/.env.local
# edit to set SOLANA_RPC_URL, BOT_USERNAME (for deep links), MOCK_MODE

# Telegram bot
cp apps/bot/.env apps/bot/.env.local
# set TELEGRAM_BOT_TOKEN, ALLOWLIST_IDS, DEFAULT_WALLET (linked wallet)

# Web app (Next.js)
cp apps/web/.env apps/web/.env.local
# ensures NEXT_PUBLIC_STRATEGY_URL=http://localhost:4000 etc.
```

## Quickstart
```bash
pnpm install

# start each service in its own terminal
pnpm --filter @dlmm-copilot/strategy dev   # Fastify on :4000
pnpm --filter @dlmm-copilot/bot dev        # Telegram bot on :4001
pnpm --filter @dlmm-copilot/web dev        # Next.js on :3000
```

Verify health checks:
```bash
curl -s http://localhost:4000/health | jq
curl -s http://localhost:4001/health | jq
open http://localhost:3000
```

## Strategy API Overview
| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Service status, mock flag, RPC connectivity |
| `/price/:pool` | GET | Current mid price for a pool |
| `/rebalance/plan` | POST | Compute target band bounds |
| `/rebalance/execute` | POST | Execute rebalance (mock/live) |
| `/orders/advanced/plan` | POST | Determine bins/notes for advanced order |
| `/orders/advanced/arm` | POST | Arm an advanced order |
| `/orders/advanced/disarm` | POST | Disarm an advanced order |
| `/bot/link-code` | POST | Issue a Telegram link code for a wallet |
| `/bot/consume-link` | POST | Bind a Telegram user to a wallet |
| `/bot/wallet/:telegramId` | GET | Resolve linked wallet |

### Example: Plan a Rebalance
```bash
curl -X POST http://localhost:4000/rebalance/plan \
  -H 'Content-Type: application/json' \
  -d '{
        "wallet": "11111111111111111111111111111111",
        "pool": "MOCK_POOL_SOL_USDC",
        "bandBps": 100
      }'
```

### Example: Telegram Link Flow
```bash
# Create a link code for a connected wallet
curl -X POST http://localhost:4000/bot/link-code \
  -H 'Content-Type: application/json' \
  -d '{ "wallet": "HY16sPSLWasPdLzBSYs2KV3gbt1EzxK1Wp6kQL5vjSpv" }'

# Bind the code to a Telegram ID (obtained via @userinfobot)
curl -X POST http://localhost:4000/bot/consume-link \
  -H 'Content-Type: application/json' \
  -d '{ "code": "ABCDEFGH", "telegramId": 995330435 }'

# Resolve the wallet later
curl http://localhost:4000/bot/wallet/995330435
```

## Telegram Bot Usage
1. **Allowlist**: Add Telegram user IDs to `ALLOWLIST_IDS` (comma separated) in `apps/bot/.env.local`.
2. **Linking**: In the web dashboard click **Link Telegram**, then follow the deep link or send `/link <CODE>` to `@botSarosbot`.
3. **Commands**:
   - `/status` – runs a lightweight rebalance plan and reports success.
   - `/rebalance`, `/widen <bps>`, `/close <percent>` – reuse the linked wallet.
   - `/link <CODE>` – rebind to a different wallet.

If no wallet is linked and mock mode is enabled, the bot falls back to the configured mock wallet but warns the user.

## Analytics & Backtest
The `/analytics` page ingests CSV candles (`timestamp,open,high,low,close`). The simulator:
- Tracks a symmetric band sized by `bandBps` around each close.
- Resets the band when price exits or cooldown expires.
- Adds a 0.02% fee on each exit, compounded into equity.
- Outputs exits, cumulative fees, and an equity curve rendered with Recharts.

## Roadmap
- **Keeper Integration** – cron-style workers to execute real swaps on live accounts.
- **Signal Inputs** – plug in external price feeds or quant strategies to adjust bands.
- **Dynamic Fees & Bin Widths** – optimize placements based on volatility & inventory.

## License
Distributed under the [MIT License](LICENSE). Feel free to hack, extend, and deploy.
