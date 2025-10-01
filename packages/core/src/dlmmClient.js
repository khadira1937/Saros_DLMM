import { createHash } from 'crypto';
import { LiquidityBookServices, MODE, } from '@saros-finance/dlmm-sdk';
import { PublicKey } from '@solana/web3.js';
import { z, ZodError } from 'zod';
import { getEnvironment } from './config';
const poolIdSchema = z.string().min(1, 'Pool address is required');
const walletSchema = z
    .string()
    .min(1, 'Wallet public key required')
    .refine((value) => {
    try {
        // eslint-disable-next-line no-new
        new PublicKey(value);
        return true;
    }
    catch {
        return false;
    }
}, 'Invalid Solana public key');
const addLiquiditySchema = z
    .object({
    pool: poolIdSchema,
    binLower: z.number().int(),
    binUpper: z.number().int(),
    singleSided: z.enum(['base', 'quote', 'both']),
    amountBase: z.string().optional(),
    amountQuote: z.string().optional(),
})
    .superRefine((value, ctx) => {
    if (value.binLower > value.binUpper) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'binLower must be less than or equal to binUpper',
            path: ['binLower'],
        });
    }
    if (value.singleSided !== 'quote') {
        if (!value.amountBase || Number(value.amountBase) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'amountBase must be provided for base or both sides',
                path: ['amountBase'],
            });
        }
    }
    if (value.singleSided !== 'base') {
        if (!value.amountQuote || Number(value.amountQuote) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'amountQuote must be provided for quote or both sides',
                path: ['amountQuote'],
            });
        }
    }
});
const removeLiquiditySchema = z
    .object({
    pool: poolIdSchema,
    binLower: z.number().int(),
    binUpper: z.number().int(),
    percent: z.number().min(0).max(100),
})
    .superRefine((value, ctx) => {
    if (value.binLower > value.binUpper) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'binLower must be less than or equal to binUpper',
            path: ['binLower'],
        });
    }
});
const priceRequestSchema = z.object({
    pool: poolIdSchema,
    targetPrice: z.number().positive(),
});
const mockPools = [
    {
        address: 'MOCK_POOL_SOL_USDC',
        tokenA: 'So11111111111111111111111111111111111111112',
        tokenB: 'USDcMock11111111111111111111111111111111',
        decimalsA: 9,
        decimalsB: 6,
    },
    {
        address: 'MOCK_POOL_BTC_USDT',
        tokenA: 'BTCMock111111111111111111111111111111111111',
        tokenB: 'USDtMock11111111111111111111111111111111',
        decimalsA: 8,
        decimalsB: 6,
    },
    {
        address: 'MOCK_POOL_ETH_SOL',
        tokenA: 'ETHMock11111111111111111111111111111111111',
        tokenB: 'So11111111111111111111111111111111111111112',
        decimalsA: 8,
        decimalsB: 9,
    },
];
const summarizeIssues = (error) => error.issues
    .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
    .join('; ');
const mapValidationError = (error) => ({
    ok: false,
    error: 'InvalidInput',
    detail: summarizeIssues(error),
});
const mapError = (error) => {
    if (error instanceof ZodError) {
        return { error: 'InvalidInput', detail: summarizeIssues(error) };
    }
    if (typeof error === 'object' && error !== null) {
        const maybeStatus = error.status;
        if (maybeStatus === 429) {
            return { error: 'RateLimited', detail: 'Rate limit exceeded' };
        }
        const maybeCode = error.code;
        if (maybeCode && ['429', 'RATE_LIMIT', 'TOO_MANY_REQUESTS'].includes(maybeCode)) {
            return { error: 'RateLimited', detail: maybeCode };
        }
    }
    const message = error instanceof Error ? error.message : undefined;
    if (message) {
        const normalized = message.toLowerCase();
        if (normalized.includes('not found')) {
            return { error: 'NotFound', detail: message };
        }
        if (normalized.includes('429') || normalized.includes('rate limit')) {
            return { error: 'RateLimited', detail: message };
        }
        if (normalized.includes('rpc') ||
            normalized.includes('econn') ||
            normalized.includes('etimedout') ||
            normalized.includes('fetch') ||
            normalized.includes('connection')) {
            return { error: 'RpcError', detail: message };
        }
    }
    return { error: 'SdkError', detail: message ?? 'Unknown SDK error' };
};
const wrap = async (fn) => {
    try {
        const value = await fn();
        return { ok: true, value };
    }
    catch (error) {
        const mapped = mapError(error);
        if (mapped.detail === undefined) {
            return { ok: false, error: mapped.error };
        }
        return { ok: false, error: mapped.error, detail: mapped.detail };
    }
};
const inferMode = (rpcUrl) => {
    if (!rpcUrl) {
        return MODE.DEVNET;
    }
    const normalized = rpcUrl.toLowerCase();
    if (normalized.includes('devnet')) {
        return MODE.DEVNET;
    }
    if (normalized.includes('testnet')) {
        return MODE.TESTNET;
    }
    return MODE.MAINNET;
};
let cachedClient = null;
let cachedKey = null;
const getClient = (rpcUrl) => {
    const mode = inferMode(rpcUrl);
    const cacheKey = `${mode}:${rpcUrl}`;
    if (!cachedClient || cacheKey !== cachedKey) {
        cachedClient = new LiquidityBookServices({
            mode,
            options: {
                rpcUrl,
            },
        });
        cachedKey = cacheKey;
    }
    return cachedClient;
};
const isMockMode = () => {
    const env = getEnvironment();
    return Boolean(env.MOCK_MODE);
};
const mockTxId = (prefix, payload) => {
    const hash = createHash('sha256')
        .update(`${prefix}:${JSON.stringify(payload)}`)
        .digest('hex')
        .slice(0, 32);
    return `MOCK-${hash}`;
};
const deriveSeed = (wallet) => {
    let total = 0;
    for (const char of wallet.slice(-8)) {
        total = (total + char.charCodeAt(0)) % 10_000;
    }
    return total;
};
const mockPositions = (wallet) => {
    const seed = deriveSeed(wallet) || 1;
    const baseAmount = (seed * 11).toString();
    const quoteAmount = (seed * 7).toString();
    const feeBase = (seed % 19).toString();
    const feeQuote = (seed % 13).toString();
    return [
        {
            pool: mockPools[0]?.address ?? 'MOCK_POOL_0',
            binLower: 10,
            binUpper: 20,
            amountBase: baseAmount,
            amountQuote: quoteAmount,
            feesBase: feeBase,
            feesQuote: feeQuote,
        },
        {
            pool: mockPools[1]?.address ?? 'MOCK_POOL_1',
            binLower: 0,
            binUpper: 15,
            amountBase: (seed * 5).toString(),
            amountQuote: (seed * 3).toString(),
            feesBase: (seed % 7).toString(),
            feesQuote: (seed % 5).toString(),
        },
    ];
};
const toPoolRef = (metadata) => ({
    address: metadata.poolAddress,
    tokenA: metadata.baseMint,
    tokenB: metadata.quoteMint,
    decimalsA: metadata.extra?.tokenBaseDecimal ?? 0,
    decimalsB: metadata.extra?.tokenQuoteDecimal ?? 0,
});
const BIN_SCALING = 100;
const computeMidPriceFromMetadata = (metadata) => {
    const baseDecimals = metadata.extra?.tokenBaseDecimal ?? 0;
    const quoteDecimals = metadata.extra?.tokenQuoteDecimal ?? 0;
    const baseReserveRaw = Number(metadata.baseReserve ?? 0);
    const quoteReserveRaw = Number(metadata.quoteReserve ?? 0);
    if (!Number.isFinite(baseReserveRaw) || !Number.isFinite(quoteReserveRaw) || baseReserveRaw <= 0) {
        return 0;
    }
    const baseReserve = baseReserveRaw / 10 ** baseDecimals;
    const quoteReserve = quoteReserveRaw / 10 ** quoteDecimals;
    if (baseReserve <= 0) {
        return 0;
    }
    return quoteReserve / baseReserve;
};
export async function listPools() {
    if (isMockMode()) {
        return { ok: true, value: [...mockPools] };
    }
    const env = getEnvironment();
    return wrap(async () => {
        const client = getClient(env.SOLANA_RPC_URL);
        const addresses = await client.fetchPoolAddresses();
        if (addresses.length === 0) {
            return [];
        }
        const metadataList = await Promise.all(addresses.map((address) => client.fetchPoolMetadata(address)));
        return metadataList.map(toPoolRef);
    });
}
export async function getUserPositions(walletPubkey) {
    const validation = walletSchema.safeParse(walletPubkey);
    if (!validation.success) {
        return mapValidationError(validation.error);
    }
    if (isMockMode()) {
        return { ok: true, value: mockPositions(validation.data) };
    }
    const env = getEnvironment();
    return wrap(async () => {
        const client = getClient(env.SOLANA_RPC_URL);
        const wallet = new PublicKey(validation.data);
        const poolsResult = await listPools();
        if (!poolsResult.ok) {
            if (poolsResult.error === 'NotFound') {
                return [];
            }
            throw new Error(poolsResult.detail ?? 'Failed to list pools');
        }
        const positions = [];
        for (const pool of poolsResult.value) {
            const rawPositions = await client.getUserPositions({
                payer: wallet,
                pair: new PublicKey(pool.address),
            });
            for (const raw of rawPositions ?? []) {
                const binLower = Number(raw.lowerBinId ?? 0);
                const binUpper = Number(raw.upperBinId ?? 0);
                const positionAddress = raw.position;
                let amountBase = '0';
                let amountQuote = '0';
                if (positionAddress) {
                    const reserveInfo = await client.getBinsReserveInformation({
                        position: new PublicKey(positionAddress),
                        pair: new PublicKey(pool.address),
                        payer: wallet,
                    });
                    const totals = reserveInfo.reduce((acc, reserve) => {
                        const baseValue = Number(reserve.reserveX ?? 0);
                        const quoteValue = Number(reserve.reserveY ?? 0);
                        return {
                            base: acc.base + baseValue,
                            quote: acc.quote + quoteValue,
                        };
                    }, { base: 0, quote: 0 });
                    amountBase = totals.base.toString();
                    amountQuote = totals.quote.toString();
                }
                positions.push({
                    pool: pool.address,
                    binLower,
                    binUpper,
                    amountBase,
                    amountQuote,
                    feesBase: '0',
                    feesQuote: '0',
                });
            }
        }
        return positions;
    });
}
export async function addLiquidity(params) {
    const validation = addLiquiditySchema.safeParse(params);
    if (!validation.success) {
        return mapValidationError(validation.error);
    }
    if (isMockMode()) {
        return {
            ok: true,
            value: { txid: mockTxId('addLiquidity', validation.data) },
        };
    }
    const env = getEnvironment();
    return wrap(async () => {
        const client = getClient(env.SOLANA_RPC_URL);
        await client.fetchPoolMetadata(validation.data.pool);
        throw new Error('Add liquidity is not implemented in the wrapper yet');
    });
}
export async function removeLiquidity(params) {
    const validation = removeLiquiditySchema.safeParse(params);
    if (!validation.success) {
        return mapValidationError(validation.error);
    }
    if (isMockMode()) {
        return {
            ok: true,
            value: { txid: mockTxId('removeLiquidity', validation.data) },
        };
    }
    const env = getEnvironment();
    return wrap(async () => {
        const client = getClient(env.SOLANA_RPC_URL);
        await client.fetchPoolMetadata(validation.data.pool);
        throw new Error('Remove liquidity is not implemented in the wrapper yet');
    });
}
export async function priceToBinIndex(pool, targetPrice) {
    const validation = priceRequestSchema.safeParse({ pool, targetPrice });
    if (!validation.success) {
        return mapValidationError(validation.error);
    }
    if (isMockMode()) {
        return { ok: true, value: Math.round(targetPrice * 100) };
    }
    const env = getEnvironment();
    return wrap(async () => {
        const client = getClient(env.SOLANA_RPC_URL);
        await client.fetchPoolMetadata(validation.data.pool);
        return Math.round(validation.data.targetPrice * BIN_SCALING);
    });
}
export async function currentMidPrice(pool) {
    const validation = poolIdSchema.safeParse(pool);
    if (!validation.success) {
        return mapValidationError(validation.error);
    }
    if (isMockMode()) {
        return { ok: true, value: 1.2345 };
    }
    const env = getEnvironment();
    return wrap(async () => {
        const client = getClient(env.SOLANA_RPC_URL);
        const metadata = await client.fetchPoolMetadata(validation.data);
        const price = computeMidPriceFromMetadata(metadata);
        if (price <= 0) {
            throw new Error('Unable to derive mid price from pool reserves');
        }
        return price;
    });
}
