import { Bot, Context, InlineKeyboard } from 'grammy';
import { createLogger } from '@dlmm-copilot/core';
import { env } from '../config';
import { StrategyService } from '../services/strategy-service';

const logger = createLogger(env.LOG_LEVEL);
const strategyService = new StrategyService(env.STRATEGY_URL);

// Rate limiting map
const userCommandCounts = new Map<number, { count: number; resetTime: number }>();

/**
 * Helper function to safely extract user ID from context
 * Returns null if ctx.from is undefined
 */
function requireUserId(ctx: Context): number | null {
  return ctx.from?.id ?? null;
}

/**
 * Check if user has exceeded rate limit
 */
function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const userLimits = userCommandCounts.get(userId);

  if (!userLimits || now > userLimits.resetTime) {
    userCommandCounts.set(userId, {
      count: 1,
      resetTime: now + 60000,
    });
    return false;
  }

  if (userLimits.count >= env.COMMAND_RATE_LIMIT_PER_MINUTE) {
    return true;
  }

  userLimits.count += 1;
  return false;
}

/**
 * Rate limiting middleware
 */
function rateLimitMiddleware() {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const userId = requireUserId(ctx);

    if (!userId) {
      await ctx.reply('❌ Unable to identify user');
      return;
    }

    if (checkRateLimit(userId)) {
      await ctx.reply('⏰ Rate limit exceeded. Please wait a moment before sending another command.');
      return;
    }

    await next();
  };
}

/**
 * Register position-related commands
 */
export function registerPositionCommands(bot: Bot): void {
  // Get user positions
  bot.command('positions', rateLimitMiddleware(), async (ctx) => {
    const userId = requireUserId(ctx);
    if (!userId) {
      await ctx.reply('❌ Unable to identify user');
      return;
    }

    logger.info(`User ${userId} requested positions`);

    try {
      await ctx.reply('🔍 Fetching your DLMM positions...');

      await ctx.reply(
        '📊 *Your DLMM Positions*\n\n' +
          '🚧 Feature coming soon! Connect your wallet first with /connect\n\n' +
          '_You currently have no active positions._',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error fetching positions:', error);
      await ctx.reply('❌ Failed to fetch positions. Please try again later.');
    }
  });

  // Get specific position details
  bot.command('position', rateLimitMiddleware(), async (ctx) => {
    const args = ctx.message?.text?.split(' ').slice(1);

    if (!args || args.length === 0) {
      await ctx.reply('❌ Please provide a position ID: /position <id>');
      return;
    }

    const positionId = args[0];
    const userId = requireUserId(ctx);
    if (!userId) {
      await ctx.reply('❌ Unable to identify user');
      return;
    }

    logger.info(`User ${userId} requested position details for ${positionId}`);

    await ctx.reply(
      `🔍 *Position Details: ${positionId}*\n\n` +
        '🚧 Feature coming soon!\n\n' +
        '_This will show detailed information about your specific DLMM position._',
      { parse_mode: 'Markdown' }
    );
  });
}

/**
 * Register strategy-related commands
 */
export function registerStrategyCommands(bot: Bot): void {
  // List user strategies
  bot.command('strategies', rateLimitMiddleware(), async (ctx) => {
    const userId = requireUserId(ctx);
    if (!userId) {
      await ctx.reply('❌ Unable to identify user');
      return;
    }

    logger.info(`User ${userId} requested strategies list`);

    try {
      const strategies = await strategyService.getUserStrategies(userId.toString());

      if (strategies.length === 0) {
        const keyboard = new InlineKeyboard().text('📈 Create Strategy', 'create_strategy');

        await ctx.reply(
          '📊 *Your DLMM Strategies*\n\n' +
            '🎯 You have no active strategies yet.\n\n' +
            '_Create your first automated LP strategy to get started!_',
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          }
        );
        return;
      }

      let message = '📊 *Your DLMM Strategies*\n\n';
      strategies.forEach((strategy, index) => {
        const status = strategy.enabled ? '🟢 Active' : '🔴 Paused';
        message += `${index + 1}. *${strategy.name}*\n`;
        message += `   Status: ${status}\n`;
        message += `   Pair: \`${strategy.pairAddress}\`\n\n`;
      });

      const keyboard = new InlineKeyboard()
        .text('📈 Create Strategy', 'create_strategy')
        .row()
        .text('⚙️ Manage Strategies', 'manage_strategies');

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      logger.error('Error fetching strategies:', error);
      await ctx.reply('❌ Failed to fetch strategies. Please try again later.');
    }
  });

  // Create new strategy
  bot.command('create_strategy', rateLimitMiddleware(), async (ctx) => {
    const userId = requireUserId(ctx);
    if (!userId) {
      await ctx.reply('❌ Unable to identify user');
      return;
    }

    logger.info(`User ${userId} wants to create a new strategy`);

    try {
      const userStrategies = await strategyService.getUserStrategies(userId.toString());

      if (userStrategies.length >= env.MAX_STRATEGIES_PER_USER) {
        await ctx.reply(
          `❌ You have reached the maximum limit of ${env.MAX_STRATEGIES_PER_USER} strategies.\n\n` +
            'Please delete an existing strategy before creating a new one.'
        );
        return;
      }

      await ctx.reply(
        '🎯 *Create New Strategy*\n\n' +
          '🚧 Strategy creation wizard coming soon!\n\n' +
          '_This will guide you through setting up an automated LP rebalancing strategy._\n\n' +
          'Features will include:\n' +
          '• 📊 Pair selection\n' +
          '• 🎚️ Rebalancing parameters\n' +
          '• 💰 Liquidity amounts\n' +
          '• ⚡ Automation settings',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error in create strategy:', error);
      await ctx.reply('❌ Failed to start strategy creation. Please try again later.');
    }
  });

  // Strategy management
  bot.command('manage', rateLimitMiddleware(), async (ctx) => {
    await ctx.reply(
      '⚙️ *Strategy Management*\n\n' +
        '🚧 Strategy management interface coming soon!\n\n' +
        'Available actions will include:\n' +
        '• ▶️ Start/Stop strategies\n' +
        '• 📝 Edit parameters\n' +
        '• 📊 View performance\n' +
        '• 🗑️ Delete strategies',
      { parse_mode: 'Markdown' }
    );
  });
}

/**
 * Register utility commands
 */
export function registerUtilityCommands(bot: Bot): void {
  // Connect wallet
  bot.command('connect', rateLimitMiddleware(), async (ctx) => {
    await ctx.reply(
      '🔗 *Connect Your Wallet*\n\n' +
        '🚧 Wallet connection coming soon!\n\n' +
        '_This will allow you to securely connect your Solana wallet to access DLMM positions and create strategies._\n\n' +
        'Supported wallets:\n' +
        '• 👻 Phantom\n' +
        '• 🌊 Solflare\n' +
        '• ⚡ Backpack\n' +
        '• 📱 Mobile wallets',
      { parse_mode: 'Markdown' }
    );
  });

  // Show help
  bot.command('help', rateLimitMiddleware(), async (ctx) => {
    const helpText =
      '🤖 *DLMM LP Copilot Bot*\n\n' +
      '🚀 *Getting Started:*\n' +
      '/connect - Connect your Solana wallet\n' +
      '/positions - View your DLMM positions\n\n' +
      '📊 *Strategy Commands:*\n' +
      '/strategies - List your strategies\n' +
      '/create_strategy - Create new strategy\n' +
      '/manage - Manage existing strategies\n\n' +
      '📈 *Position Commands:*\n' +
      '/position <id> - View position details\n\n' +
      '⚙️ *Utility Commands:*\n' +
      '/help - Show this help message\n' +
      '/status - Bot status\n\n' +
      '🔗 *Links:*\n' +
      '• [Saros Finance](https://saros.finance)\n' +
      '• [Documentation](https://docs.saros.finance)\n' +
      '• [Support](https://t.me/sarosfinance)';

    await ctx.reply(helpText, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  });

  // Bot status
  bot.command('status', rateLimitMiddleware(), async (ctx) => {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    await ctx.reply(
      '🟢 *Bot Status*\n\n' +
        `⏰ Uptime: ${hours}h ${minutes}m\n` +
        `🌐 Network: ${env.NODE_ENV}\n` +
        `📊 Active Users: ${userCommandCounts.size}\n` +
        `🔧 API Status: Connected\n\n` +
        '_All systems operational!_',
      { parse_mode: 'Markdown' }
    );
  });
}
