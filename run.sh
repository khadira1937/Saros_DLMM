#!/bin/bash

# DLMM LP Copilot - Development Setup & Run Commands
# This script provides all the commands needed to run the project

echo "🚀 DLMM LP Copilot - Development Commands"
echo "========================================"

# Environment Variables
export NODE_ENV=development
export SOLANA_RPC_URL=https://api.devnet.solana.com
export SOLANA_WS_URL=wss://api.devnet.solana.com
export LOG_LEVEL=info

echo "✅ Environment configured for Solana Devnet"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🛠️  Available Commands:"
echo "======================="
echo ""
echo "📱 Development (run all services):"
echo "  pnpm dev                 # Start all services in development mode"
echo ""
echo "🔧 Individual Services:"
echo "  pnpm web:dev            # Web app (http://localhost:3000)"
echo "  pnpm strategy:dev       # Strategy API (http://localhost:3001)"
echo "  pnpm bot:dev            # Telegram bot"
echo ""
echo "🏗️  Building:"
echo "  pnpm build              # Build all packages"
echo "  pnpm typecheck          # TypeScript checking"
echo "  pnpm lint               # ESLint checking"
echo ""
echo "🐳 Docker:"
echo "  docker-compose -f infra/docker/docker-compose.yml up"
echo ""
echo "🧪 Testing:"
echo "  pnpm test               # Run tests"
echo "  pnpm format             # Format code"
echo "  pnpm clean              # Clean build artifacts"
echo ""
echo "⚙️  Configuration:"
echo "  1. Copy .env files to .env.local in each app/service"
echo "  2. Set BOT_TOKEN for Telegram bot"
echo "  3. Configure wallet connections"
echo ""
echo "📚 Documentation:"
echo "  - Web UI: http://localhost:3000"
echo "  - API Docs: http://localhost:3001/docs"  
echo "  - README.md for detailed setup"
echo ""
echo "🎯 Quick Start:"
echo "  1. pnpm dev              # Start all services"
echo "  2. Open http://localhost:3000"
echo "  3. Connect your Solana wallet"
echo "  4. Start managing DLMM strategies!"