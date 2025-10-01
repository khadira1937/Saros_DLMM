// Load .env in local/dev; tolerate absence in production
try {
  await import('dotenv/config'); // ESM-friendly side-effect import
} catch {}

import http from 'node:http';

import pino from 'pino';
import { Telegraf, type Context } from 'telegraf';
import { z } from 'zod';
import type { StrategyResult, StrategyProblem } from '@dlmm-copilot/core';

const parseEnvBoolean = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
};

const {
  planRebalance,
  executeRebalance,
  getWalletByTelegram: fetchWalletByTelegram,
  consumeLink: consumeLinkApi,
} = await import('@dlmm-copilot/core');

const env = {
  TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
  PORT: Number(process.env.PORT ?? process.env.BOT_PORT ?? 4001),
  STRATEGY_URL: process.env.STRATEGY_URL ?? 'http://localhost:4000',
  DEFAULT_WALLET: process.env.DEFAULT_WALLET ?? 'WALLET_MOCK',
  DEFAULT_POOL: process.env.DEFAULT_POOL ?? 'MOCK_POOL_SOL_USDC',
  DEFAULT_BAND_BPS: Number(process.env.DEFAULT_BAND_BPS ?? 100),
  MOCK_MODE: parseEnvBoolean(process.env.MOCK_MODE),
  ALLOWLIST_IDS: (process.env.ALLOWLIST_IDS ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0),
};

if (!process.env.NEXT_PUBLIC_STRATEGY_URL) {
  process.env.NEXT_PUBLIC_STRATEGY_URL = env.STRATEGY_URL;
}
if (!process.env.STRATEGY_URL) {
  process.env.STRATEGY_URL = env.STRATEGY_URL;
}

const log = pino({ level: 'info', base: null });

const rateLimitMs = 15_000;
const nextAllowedByUser = new Map<number, number>();

const dryRun = env.TOKEN.length === 0;
log.info(
  {
    dryRun,
    tokenPresent: env.TOKEN.length > 0,
    allowlistCount: env.ALLOWLIST_IDS.length,
  },
  'env status',
);
if (dryRun) {
  log.warn('TELEGRAM_BOT_TOKEN missing — starting in DRY-RUN mode');
}

function isAllowed(ctx: Context): boolean {
  const id = ctx.from?.id;
  if (!id) return false;
  if (env.ALLOWLIST_IDS.length === 0) return true;
  return env.ALLOWLIST_IDS.includes(String(id));
}

function checkRate(ctx: Context): { ok: true } | { ok: false; wait: number } {
  const id = ctx.from?.id;
  if (!id) {
    return { ok: false, wait: rateLimitMs / 1000 };
  }
  const now = Date.now();
  const nextAllowed = nextAllowedByUser.get(id) ?? 0;
  if (now < nextAllowed) {
    return { ok: false, wait: Math.ceil((nextAllowed - now) / 1000) };
  }
  nextAllowedByUser.set(id, now + rateLimitMs);
  return { ok: true };
}

function fmtResult<T>(result: StrategyResult<T>): string {
  if (result.ok) {
    return 'ok';
  }
  const detail = result.problem.detail ? ` — ${result.problem.detail}` : '';
  return `${result.problem.title}${detail}`;
}

async function doRebalanceWithWallet(
  wallet: string,
  bandBps: number,
): Promise<{ ok: true; tx: string } | { ok: false; msg: string }> {
  const body = {
    wallet,
    pool: env.DEFAULT_POOL,
    bandBps,
  };
  const plan = await planRebalance(body);
  if (!plan.ok) {
    return { ok: false, msg: fmtResult(plan) };
  }
  const exec = await executeRebalance(body);
  if (!exec.ok) {
    return { ok: false, msg: fmtResult(exec) };
  }
  const tx = exec.value.txids[0] ?? 'unknown';
  return { ok: true, tx };
}

const widenSchema = z.tuple([z.coerce.number().int().positive()]);
const closeSchema = z.tuple([z.coerce.number().positive()]);
const linkSchema = z.tuple([z.string().regex(/^[A-Z0-9]{6,16}$/)]).rest(z.never());

type WalletLookupResult = { ok: true; wallet: string } | { ok: false; problem?: StrategyProblem };

const getLinkedWallet = async (telegramId: number): Promise<WalletLookupResult> => {
  const result = await fetchWalletByTelegram(telegramId);
  if (result.ok) {
    return { ok: true, wallet: result.value.wallet };
  }
  const failure = result as { ok: false; problem: StrategyProblem };
  return { ok: false, problem: failure.problem };
};

const bot = dryRun ? null : new Telegraf(env.TOKEN);

if (bot) {
  type WalletSource = 'linked' | 'mock';

  const resolveWallet = async (
    ctx: Context,
  ): Promise<{ ok: true; wallet: string; source: WalletSource } | { ok: false; message: string }> => {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      return { ok: false, message: 'Unable to resolve Telegram user.' };
    }

    const linked = await getLinkedWallet(telegramId);
    if (linked.ok) {
      return { ok: true, wallet: linked.wallet, source: 'linked' };
    }

    if (linked.problem && linked.problem.status !== 404) {
      return {
        ok: false,
        message: linked.problem.detail ?? linked.problem.title ?? 'Unable to resolve linked wallet.',
      };
    }

    if (env.MOCK_MODE && env.DEFAULT_WALLET.length >= 32) {
      return { ok: true, wallet: env.DEFAULT_WALLET, source: 'mock' };
    }

    return {
      ok: false,
      message: 'No wallet linked. Open the web app, click “Link Telegram”, then run /link <CODE>.',
    };
  };

  const withWallet = async (
    ctx: Context,
    handler: (wallet: string, source: WalletSource) => Promise<void>,
  ) => {
    const resolved = await resolveWallet(ctx);
    if (!resolved.ok) {
      await ctx.reply(resolved.message);
      return;
    }
    if (resolved.source === 'mock') {
      await ctx.reply('No wallet linked; using mock wallet (development mode).');
    }
    await handler(resolved.wallet, resolved.source);
  };

  bot.start(async (ctx) => {
    if (!isAllowed(ctx)) {
      await ctx.reply('Access denied.');
      return;
    }
    const telegramId = ctx.from?.id;
    let linkedSuffix = 'No wallet linked. Use the web app to generate a link code.';
    if (telegramId) {
      const lookup = await getLinkedWallet(telegramId);
      if (lookup.ok) {
        linkedSuffix = `Linked wallet: …${lookup.wallet.slice(-6)}`;
      }
    }
    await ctx.reply(
      'DLMM Copilot bot ready.\n' +
        '/status — probe strategy service\n' +
        `/rebalance — uses default band ${env.DEFAULT_BAND_BPS} bps\n` +
        '/widen <bps> — rebalance with wider band\n' +
        '/close <percent> — shrink band by percent of default\n' +
        '/link <CODE> — link your wallet\n' +
        linkedSuffix,
    );
  });

  bot.command('link', async (ctx) => {
    if (!isAllowed(ctx)) {
      await ctx.reply('Not allowed.');
      return;
    }
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply('Unable to resolve Telegram user.');
      return;
    }
    const args = (ctx.message?.text ?? '').split(' ').slice(1);
    const parsed = linkSchema.safeParse(args.map((part) => part.toUpperCase()));
    if (!parsed.success) {
      await ctx.reply('Usage: /link <CODE> (uppercase letters + numbers)');
      return;
    }
    const code = parsed.data[0];
    const result = await consumeLinkApi({ code, telegramId });
    if (result.ok) {
      await ctx.reply(`Linked ✅ to wallet …${result.value.wallet.slice(-6)}`);
    } else {
      await ctx.reply(`Failed to link: ${result.problem.detail ?? result.problem.title}`);
    }
  });

  bot.command('status', async (ctx) => {
    if (!isAllowed(ctx)) {
      await ctx.reply('Not allowed.');
      return;
    }
    const limited = checkRate(ctx);
    if (!limited.ok) {
      await ctx.reply(`Slow down. Try again in ${limited.wait}s.`);
      return;
    }
    await withWallet(ctx, async (wallet) => {
      const probe = await planRebalance({
        wallet,
        pool: env.DEFAULT_POOL,
        bandBps: env.DEFAULT_BAND_BPS,
      });
      await ctx.reply(probe.ok ? 'Strategy service reachable ✅' : `Strategy error: ${fmtResult(probe)}`);
    });
  });

  bot.command('rebalance', async (ctx) => {
    if (!isAllowed(ctx)) {
      await ctx.reply('Not allowed.');
      return;
    }
    const limited = checkRate(ctx);
    if (!limited.ok) {
      await ctx.reply(`Slow down. Try again in ${limited.wait}s.`);
      return;
    }
    await withWallet(ctx, async (wallet) => {
      const result = await doRebalanceWithWallet(wallet, env.DEFAULT_BAND_BPS);
      await ctx.reply(result.ok ? `Rebalance submitted. Tx: ${result.tx}` : `Failed: ${result.msg}`);
    });
  });

  bot.command('widen', async (ctx) => {
    if (!isAllowed(ctx)) {
      await ctx.reply('Not allowed.');
      return;
    }
    const limited = checkRate(ctx);
    if (!limited.ok) {
      await ctx.reply(`Slow down. Try again in ${limited.wait}s.`);
      return;
    }
    const args = (ctx.message?.text ?? '').split(' ').slice(1);
    const parsed = widenSchema.safeParse(args);
    if (!parsed.success) {
      await ctx.reply('Usage: /widen <bps>');
      return;
    }
    const bps = parsed.data[0];
    await withWallet(ctx, async (wallet) => {
      const result = await doRebalanceWithWallet(wallet, bps);
      await ctx.reply(result.ok ? `Rebalance (bps=${bps}) submitted. Tx: ${result.tx}` : `Failed: ${result.msg}`);
    });
  });

  bot.command('close', async (ctx) => {
    if (!isAllowed(ctx)) {
      await ctx.reply('Not allowed.');
      return;
    }
    const limited = checkRate(ctx);
    if (!limited.ok) {
      await ctx.reply(`Slow down. Try again in ${limited.wait}s.`);
      return;
    }
    const args = (ctx.message?.text ?? '').split(' ').slice(1);
    const parsed = closeSchema.safeParse(args);
    if (!parsed.success) {
      await ctx.reply('Usage: /close <percent>');
      return;
    }
    const percent = parsed.data[0];
    const bps = Math.max(1, Math.round(env.DEFAULT_BAND_BPS * (1 - percent / 100)));
    await withWallet(ctx, async (wallet) => {
      const result = await doRebalanceWithWallet(wallet, bps);
      await ctx.reply(result.ok ? `Rebalance (closed to ${bps} bps) submitted. Tx: ${result.tx}` : `Failed: ${result.msg}`);
    });
  });

  bot.catch((error, ctx) => {
    log.error({ err: error }, 'telegraf error');
    ctx.reply?.('Bot error occurred.');
  });
}

const server = http.createServer((req, res) => {
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
  } as const;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  res.end(
    JSON.stringify({
      ok: true,
      dryRun,
      strategyUrl: env.STRATEGY_URL,
      defaultPool: env.DEFAULT_POOL,
      defaultBandBps: env.DEFAULT_BAND_BPS,
    }),
  );
});

server.listen(env.PORT, () => {
  log.info({ port: env.PORT, dryRun }, 'bot server started');
  if (bot) {
    void bot.launch().then(() => log.info('telegram bot launched'));
  }
});

const shutdown = (signal: string) => {
  log.info({ signal }, 'shutting down bot');
  if (bot) {
    bot.stop(signal);
  }
  server.close(() => {
    log.info('health server closed');
    process.exit(0);
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
