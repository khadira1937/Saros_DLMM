# Deployment Guide

## Render Services Setup

### Strategy Service (Already Deployed)
- **Type**: Web Service (Docker)
- **Build**: Automatic via Dockerfile
- **URL**: https://saros-dlmm.onrender.com
- **Health Check**: `/health`

**Environment Variables:**
```
CORS_ORIGINS=https://saros-dlmm-web-git-main-khadira1937s-projects.vercel.app,https://saros-dlmm-kdhjggns4-khadira1937s-projects.vercel.app,http://localhost:3000
```

### Bot Service (Node.js)
- **Type**: Web Service (Node.js)
- **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @dlmm-copilot/core build && pnpm --filter @dlmm-copilot/bot build`
- **Start Command**: `node apps/bot/dist/index.js`
- **Health Check**: `/`

**Environment Variables:**
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
STRATEGY_URL=https://saros-dlmm.onrender.com
PORT=10000
DEFAULT_WALLET=your_default_wallet_address
DEFAULT_POOL=MOCK_POOL_SOL_USDC
DEFAULT_BAND_BPS=100
MOCK_MODE=false
ALLOWLIST_IDS=your_telegram_user_ids
```

## Vercel Frontend (Already Deployed)
- **Framework**: Next.js
- **Build Command**: Automatic
- **URL**: https://saros-dlmm-web-git-main-khadira1937s-projects.vercel.app

**Environment Variables:**
```
NEXT_PUBLIC_STRATEGY_URL=https://saros-dlmm.onrender.com
NEXT_PUBLIC_BOT_HEALTH_URL=https://your-bot-service.onrender.com
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_MOCK_MODE=false
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Steps to Deploy Bot Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository: `khadira1937/Saros_DLMM`
4. Configure:
   - **Name**: dlmm-bot
   - **Environment**: Node.js
   - **Region**: Choose closest to your users
   - **Branch**: main
   - **Root Directory**: (leave empty)
   - **Build Command**: `pnpm install --frozen-lockfile && pnpm --filter @dlmm-copilot/core build && pnpm --filter @dlmm-copilot/bot build`
   - **Start Command**: `node apps/bot/dist/index.js`
5. Add environment variables from the list above
6. Click "Create Web Service"

## Troubleshooting

### Common Issues:
1. **CORS Error**: Make sure CORS_ORIGINS includes your Vercel domain
2. **Bot Not Responding**: Check TELEGRAM_BOT_TOKEN is set correctly
3. **Build Failed**: Ensure pnpm is available (it should be on Render)
4. **Strategy Connection Failed**: Verify STRATEGY_URL points to your deployed strategy service

### Health Check Endpoints:
- Strategy: `https://saros-dlmm.onrender.com/health`
- Bot: `https://your-bot-service.onrender.com/` (returns JSON with bot status)
- Frontend: `https://saros-dlmm-web-git-main-khadira1937s-projects.vercel.app`