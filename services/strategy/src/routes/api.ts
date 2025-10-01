import { createHash } from 'crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  currentMidPrice,
  priceToBinIndex,
  listPools,
  type DomainError,
  type Result,
} from '@dlmm-copilot/core';
import { PublicKey } from '@solana/web3.js';

import { env } from '../config.js';
import { defaultProblemType, sendProblem, type ProblemDetail } from '../utils/problem.js';
import {
  AdvancedArmReq,
  AdvancedArmResp,
  AdvancedDisarmReq,
  AdvancedDisarmResp,
  AdvancedKind,
  AdvancedPlanReq,
  AdvancedPlanResp,
} from '../schemas/advancedOrders.js';
import { consumeCode, createCode, getWallet } from '../botLinkStore.js';

const walletCooldownMs = 15_000;
const walletCooldown = new Map<string, number>();
const linkRateLimitMs = 10_000;
const linkCooldownByWallet = new Map<string, number>();

const maskUrl = (value: string | undefined): string => {
  if (!value) {
    return 'unknown';
  }
  const trimmed = value.trim();
  if (trimmed.length <= 32) {
    return trimmed;
  }
  const prefix = trimmed.slice(0, 24);
  const suffix = trimmed.slice(-6);
  return `${prefix}...${suffix}`;
};

const publicKeySchema = z.string().min(32).max(64).superRefine((value, ctx) => {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid Solana public key',
    });
  }
});

const poolSchema = z.string().min(1, 'Pool identifier is required');
const telegramIdSchema = z.number().int().positive();
const linkCodeSchema = z
  .string()
  .min(6)
  .max(16)
  .regex(/^[A-Z0-9]+$/, 'Code must be uppercase alphanumeric');

const rebalanceBodySchema = z.object({
  wallet: publicKeySchema,
  pool: poolSchema,
  bandBps: z
    .number({ description: 'Band width in basis points' })
    .int()
    .min(1)
    .max(10_000),
});

const priceParamsSchema = z.object({
  pool: poolSchema,
});

const linkCodeRequestSchema = z.object({
  wallet: z.string().min(1, 'Wallet is required'),
});

const linkCodeResponseSchema = z.object({
  code: z.string().min(6),
  deeplink: z.string().url().optional(),
  note: z.string().optional(),
});

const consumeLinkRequestSchema = z.object({
  code: linkCodeSchema,
  telegramId: telegramIdSchema,
});

const consumeLinkResponseSchema = z.object({
  wallet: z.string().min(32),
});

const walletByTelegramResponseSchema = z.object({
  wallet: z.string().min(32),
});

const statusByError: Record<DomainError, number> = {
  InvalidInput: 400,
  NotFound: 404,
  RateLimited: 429,
  RpcError: 502,
  SdkError: 502,
};

const mapResult = <T>(
  result: Result<T>,
  reply: FastifyReply,
  context: { title: string; type?: string },
): T | undefined => {
  if (result.ok) {
    return result.value;
  }

  const problem: ProblemDetail = {
    type: context.type ?? defaultProblemType,
    title: context.title,
    status: statusByError[result.error] ?? 500,
    detail: result.detail,
    code: result.error,
  };
  sendProblem(reply, problem);
  return undefined;
};

const mockTxId = (prefix: string, payload: unknown): string =>
  `MOCK-${createHash('md5')
    .update(`${prefix}:${JSON.stringify(payload)}`)
    .digest('hex')
    .slice(0, 32)}`;

const buildAdvancedBins = (kind: AdvancedKind, baseIndex: number): number[] => {
  const coreBins =
    kind === 'limitSell'
      ? [baseIndex, baseIndex + 1, baseIndex + 2]
      : [baseIndex, baseIndex - 1, baseIndex - 2];
  const sanitized = coreBins
    .filter((bin) => Number.isFinite(bin) && bin >= 0)
    .map((bin) => Math.trunc(bin));
  const unique = Array.from(new Set(sanitized));
  if (unique.length === 0) {
    unique.push(Math.max(0, Math.trunc(baseIndex)));
  }
  return unique.sort((a, b) => a - b);
};

const singleSidedForKind = (kind: AdvancedKind): 'base' | 'quote' => {
  if (kind === 'limitSell' || kind === 'stopLoss') {
    return 'base';
  }
  return 'quote';
};

const noteForKind = (kind: AdvancedKind): string => {
  switch (kind) {
    case 'limitSell':
      return 'Places base-only liquidity at/above the target to sell into strength.';
    case 'stopLoss':
      return 'Places base-only liquidity below the trigger so fills convert to quote once price crosses lower.';
    case 'limitBuy':
    default:
      return 'Places quote-only liquidity at/below the target to accumulate base when price trades down.';
  }
};

const checkCooldown = (wallet: string): { ok: true } | { ok: false; retryAfter: number } => {
  const now = Date.now();
  const nextAllowed = walletCooldown.get(wallet) ?? 0;
  if (now < nextAllowed) {
    return { ok: false, retryAfter: Math.ceil((nextAllowed - now) / 1000) };
  }
  walletCooldown.set(wallet, now + walletCooldownMs);
  return { ok: true };
};

const buildProblem = (
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
  code?: string,
) =>
  sendProblem(reply, {
    type: defaultProblemType,
    title,
    status,
    detail,
    code,
  });

const computeTargetBins = async (
  pool: string,
  midPrice: number,
  bandBps: number,
  reply: FastifyReply,
): Promise<{ binLower: number; binUpper: number; currentBin: number } | undefined> => {
  const ratio = bandBps / 10_000;
  const lowerPrice = midPrice * (1 - ratio);
  const upperPrice = midPrice * (1 + ratio);

  const currentBinResult = await priceToBinIndex(pool, midPrice);
  const currentBin = mapResult(currentBinResult, reply, { title: 'Failed to determine active bin' });
  if (currentBin === undefined) {
    return undefined;
  }

  const lowerResult = await priceToBinIndex(pool, lowerPrice);
  const lowerBin = mapResult(lowerResult, reply, { title: 'Failed to compute lower band bin' });
  if (lowerBin === undefined) {
    return undefined;
  }

  const upperResult = await priceToBinIndex(pool, upperPrice);
  const upperBin = mapResult(upperResult, reply, { title: 'Failed to compute upper band bin' });
  if (upperBin === undefined) {
    return undefined;
  }

  return {
    binLower: Math.min(lowerBin, upperBin),
    binUpper: Math.max(lowerBin, upperBin),
    currentBin,
  };
};

const handleNotImplemented = (reply: FastifyReply, action: string) =>
  buildProblem(reply, 501, 'Not Implemented', `${action} is not implemented for live mode yet.`, 'NotImplemented');

export const registerStrategyRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/health', async (_request, reply) => {
    let rpcStatus: 'connected' | 'error' = 'connected';
    try {
      const pools = await listPools();
      if (!pools.ok && pools.error === 'RpcError') {
        rpcStatus = 'error';
      }
    } catch {
      rpcStatus = 'error';
    }

    return reply.send({
      status: 'ok',
      mockMode: Boolean(env.MOCK_MODE),
      rpc: {
        url: maskUrl(env.SOLANA_RPC_URL),
        status: rpcStatus,
      },
      sdk: {
        status: env.MOCK_MODE ? 'mock' : 'ready',
      },
    });
  });

  fastify.post('/bot/link-code', async (request, reply) => {
    const parseResult = linkCodeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return buildProblem(reply, 400, 'Invalid Request', parseResult.error.message, 'InvalidInput');
    }

    const requestedWallet = parseResult.data.wallet.trim();
    let walletToUse = requestedWallet;
    if (requestedWallet === 'WALLET_MOCK') {
      if (!env.MOCK_MODE) {
        return buildProblem(reply, 400, 'Invalid Request', 'Mock wallet unavailable in live mode.', 'InvalidInput');
      }
      walletToUse = '11111111111111111111111111111111';
    }

    try {
      // validate wallet using existing schema
      publicKeySchema.parse(walletToUse);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid wallet';
      return buildProblem(reply, 400, 'Invalid Wallet', message, 'InvalidInput');
    }

    const now = Date.now();
    const nextAllowed = linkCooldownByWallet.get(walletToUse) ?? 0;
    if (now < nextAllowed) {
      const retryAfter = Math.ceil((nextAllowed - now) / 1000);
      return buildProblem(
        reply,
        429,
        'Rate Limited',
        `Try again in ${retryAfter} seconds.`,
        'RateLimited',
      );
    }

    linkCooldownByWallet.set(walletToUse, now + linkRateLimitMs);

    const code = createCode(walletToUse);
    const botUsername =
      (process.env.BOT_USERNAME ?? (env as { BOT_USERNAME?: string }).BOT_USERNAME ?? '').trim();
    const response = {
      code,
      deeplink:
        botUsername.length > 0 ? `https://t.me/${botUsername}?start=link_${code}` : undefined,
      note: botUsername.length > 0 ? undefined : 'Send /link <CODE> to your bot to complete linking.',
    };

    return reply.send(linkCodeResponseSchema.parse(response));
  });

  fastify.post('/bot/consume-link', async (request, reply) => {
    const parseResult = consumeLinkRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return buildProblem(reply, 400, 'Invalid Request', parseResult.error.message, 'InvalidInput');
    }

    const outcome = consumeCode(parseResult.data.code, parseResult.data.telegramId);
    if (!outcome.ok) {
      const detail = outcome.reason === 'expired' ? 'Link code expired' : 'Invalid link code';
      return buildProblem(reply, 400, 'Invalid Link Code', detail, 'InvalidInput');
    }

    return reply.send(consumeLinkResponseSchema.parse({ wallet: outcome.wallet }));
  });

  fastify.get('/bot/wallet/:telegramId', async (request, reply) => {
    const params = z
      .object({ telegramId: telegramIdSchema })
      .safeParse({ telegramId: Number((request.params as { telegramId?: string })?.telegramId) });
    if (!params.success) {
      return buildProblem(reply, 400, 'Invalid Request', params.error.message, 'InvalidInput');
    }

    const wallet = getWallet(params.data.telegramId);
    if (!wallet) {
      return buildProblem(reply, 404, 'Not Found', 'No wallet linked for this Telegram user.', 'NotFound');
    }

    return reply.send(walletByTelegramResponseSchema.parse({ wallet }));
  });

  fastify.get('/price/:pool', async (request, reply) => {
    const parseResult = priceParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      return buildProblem(reply, 400, 'Invalid Request', parseResult.error.message, 'InvalidInput');
    }

    const midPriceResult = await currentMidPrice(parseResult.data.pool);
    const midPrice = mapResult(midPriceResult, reply, { title: 'Failed to fetch mid price' });
    if (midPrice === undefined) {
      return;
    }

    return reply.send({ midPrice });
  });

  fastify.post('/rebalance/plan', async (request, reply) => {
    const bodyResult = rebalanceBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return buildProblem(reply, 400, 'Invalid Request', bodyResult.error.message, 'InvalidInput');
    }

    const { pool, bandBps } = bodyResult.data;

    const midPriceResult = await currentMidPrice(pool);
    const midPrice = mapResult(midPriceResult, reply, { title: 'Failed to fetch mid price' });
    if (midPrice === undefined) {
      return;
    }

    const band = await computeTargetBins(pool, midPrice, bandBps, reply);
    if (!band) {
      return;
    }

    const inBand = band.currentBin >= band.binLower && band.currentBin <= band.binUpper;

    return reply.send({
      inBand,
      target: {
        binLower: band.binLower,
        binUpper: band.binUpper,
      },
      current: {
        midPrice,
        binIndex: band.currentBin,
      },
    });
  });

  fastify.post('/rebalance/execute', async (request, reply) => {
    const bodyResult = rebalanceBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return buildProblem(reply, 400, 'Invalid Request', bodyResult.error.message, 'InvalidInput');
    }

    const { wallet } = bodyResult.data;
    const cooldown = checkCooldown(wallet);
    if (!cooldown.ok) {
      return buildProblem(reply, 429, 'Too Many Requests', `Try again in ${cooldown.retryAfter} seconds.`, 'RateLimited');
    }

    if (env.MOCK_MODE) {
      return reply.send({
        txids: [mockTxId('rebalance-execute', bodyResult.data)],
      });
    }

    return handleNotImplemented(reply, 'Rebalance execution');
  });

  fastify.post('/orders/advanced/plan', async (request, reply) => {
    const parsed = AdvancedPlanReq.safeParse(request.body);
    if (!parsed.success) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Invalid Request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      });
    }

    const { pool, spec } = parsed.data;

    const indexResult = await priceToBinIndex(pool, spec.targetPrice);
    const baseIndex = mapResult(indexResult, reply, { title: 'Failed to calculate target bin' });
    if (baseIndex === undefined) {
      return;
    }

    const bins = buildAdvancedBins(spec.kind, baseIndex);
    const singleSided = singleSidedForKind(spec.kind);
    const note = noteForKind(spec.kind);

    return reply.send(
      AdvancedPlanResp.parse({
        bins,
        singleSided,
        note,
      }),
    );
  });

  fastify.post('/orders/advanced/arm', async (request, reply) => {
    const parsed = AdvancedArmReq.safeParse(request.body);
    if (!parsed.success) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Invalid Request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      });
    }

    const { wallet, pool, spec } = parsed.data;
    const cooldown = checkCooldown(wallet);
    if (!cooldown.ok) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Too Many Requests',
        status: 429,
        detail: `Try again in ${cooldown.retryAfter} seconds.`,
        code: 'RateLimited',
      });
    }

    const indexResult = await priceToBinIndex(pool, spec.targetPrice);
    const baseIndex = mapResult(indexResult, reply, { title: 'Failed to calculate target bin' });
    if (baseIndex === undefined) {
      return;
    }

    const bins = buildAdvancedBins(spec.kind, baseIndex);
    const singleSided = singleSidedForKind(spec.kind);

    const amountBase = singleSided === 'base' ? spec.sizeBase : undefined;
    const amountQuote = singleSided === 'quote' ? spec.sizeQuote : undefined;

    if (singleSided === 'base' && (!amountBase || Number(amountBase) <= 0)) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Invalid Request',
        status: 400,
        detail: 'Provide a positive base size for this advanced order.',
        code: 'InvalidInput',
      });
    }

    if (singleSided === 'quote' && (!amountQuote || Number(amountQuote) <= 0)) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Invalid Request',
        status: 400,
        detail: 'Provide a positive quote size for this advanced order.',
        code: 'InvalidInput',
      });
    }

    if (env.MOCK_MODE) {
      const txid = mockTxId('advanced-arm', { ...parsed.data, bins });
      return reply.send(AdvancedArmResp.parse({ txid }));
    }

    return sendProblem(reply, {
      type: defaultProblemType,
      title: 'Not Implemented',
      status: 501,
      detail: 'Advanced order arming is not implemented for live mode yet.',
      code: 'NotImplemented',
    });
  });

  fastify.post('/orders/advanced/disarm', async (request, reply) => {
    const parsed = AdvancedDisarmReq.safeParse(request.body);
    if (!parsed.success) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Invalid Request',
        status: 400,
        detail: parsed.error.message,
        code: 'InvalidInput',
      });
    }

    const { wallet } = parsed.data;
    const cooldown = checkCooldown(wallet);
    if (!cooldown.ok) {
      return sendProblem(reply, {
        type: defaultProblemType,
        title: 'Too Many Requests',
        status: 429,
        detail: `Try again in ${cooldown.retryAfter} seconds.`,
        code: 'RateLimited',
      });
    }

    if (env.MOCK_MODE) {
      const txid = mockTxId('advanced-disarm', parsed.data);
      return reply.send(AdvancedDisarmResp.parse({ txid }));
    }

    return sendProblem(reply, {
      type: defaultProblemType,
      title: 'Not Implemented',
      status: 501,
      detail: 'Advanced order disarming is not implemented for live mode yet.',
      code: 'NotImplemented',
    });
  });
};
