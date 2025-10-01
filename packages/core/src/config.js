import { z } from 'zod';
const emptyStringToUndefined = (value) => {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
};
const optionalStringEnv = z.preprocess(emptyStringToUndefined, z.string().optional());
const optionalUrlEnv = z.preprocess(emptyStringToUndefined, z.string().url().optional());
const booleanEnv = (defaultValue) => z
    .preprocess((value) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
            return false;
        }
    }
    return undefined;
}, z.boolean())
    .default(defaultValue);
const portEnv = (defaultPort) => z
    .preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(65535))
    .default(defaultPort);
const positiveIntEnv = (defaultValue) => z
    .preprocess(emptyStringToUndefined, z.coerce.number().int().positive())
    .default(defaultValue);
// Standardized environment configuration schema
export const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
    SOLANA_WS_URL: optionalUrlEnv,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    MOCK_MODE: booleanEnv(true),
});
// Strategy service specific schema
export const StrategyEnvSchema = EnvSchema.extend({
    STRATEGY_PORT: portEnv(4000),
    WALLET_PRIVATE_KEY_DEVNET: optionalStringEnv,
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    PYTH_PROGRAM_ID: optionalStringEnv,
    PYTH_WS_URL: optionalUrlEnv,
    JUPITER_QUOTE_URL: optionalUrlEnv,
});
// Bot specific schema
export const BotEnvSchema = EnvSchema.extend({
    BOT_PORT: portEnv(4001),
    TELEGRAM_BOT_TOKEN: optionalStringEnv,
    ALLOWLIST_IDS: optionalStringEnv.transform((value) => value?.split(',').map((id) => id.trim()).filter((id) => id.length > 0) ?? []),
    DEFAULT_BAND_BPS: positiveIntEnv(100),
    STRATEGY_URL: z.string().url().default('http://localhost:4000'),
    COMMAND_RATE_LIMIT_PER_MINUTE: positiveIntEnv(20),
    MAX_STRATEGIES_PER_USER: positiveIntEnv(5),
});
// Web specific schema
export const WebEnvSchema = z.object({
    NEXT_PUBLIC_STRATEGY_URL: z.string().url().default('http://localhost:4000'),
    NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
    NEXT_PUBLIC_SOLANA_NETWORK: z.enum(['devnet', 'testnet', 'mainnet-beta']).default('devnet'),
    NEXT_PUBLIC_CLUSTER: z.enum(['devnet', 'testnet', 'mainnet-beta']).default('devnet'),
});
const logValidationWarning = (context, error) => {
    console.warn(`Environment validation failed for ${context}. Falling back to defaults.`, error);
};
/**
 * Validates and parses core environment variables with fallbacks
 * Logs warnings for missing variables but does not crash the process
 */
export function getEnvironment() {
    try {
        return EnvSchema.parse(process.env);
    }
    catch (error) {
        logValidationWarning('core', error);
        return {
            NODE_ENV: 'development',
            SOLANA_RPC_URL: 'https://api.devnet.solana.com',
            SOLANA_WS_URL: undefined,
            LOG_LEVEL: 'info',
            MOCK_MODE: true,
        };
    }
}
/**
 * Get strategy service environment with safe defaults
 */
export function getStrategyEnvironment() {
    try {
        return StrategyEnvSchema.parse(process.env);
    }
    catch (error) {
        logValidationWarning('strategy service', error);
        return {
            NODE_ENV: 'development',
            SOLANA_RPC_URL: 'https://api.devnet.solana.com',
            SOLANA_WS_URL: undefined,
            LOG_LEVEL: 'info',
            MOCK_MODE: true,
            STRATEGY_PORT: 4000,
            WALLET_PRIVATE_KEY_DEVNET: undefined,
            CORS_ORIGINS: 'http://localhost:3000',
            PYTH_PROGRAM_ID: undefined,
            PYTH_WS_URL: undefined,
            JUPITER_QUOTE_URL: undefined,
        };
    }
}
/**
 * Get bot environment with safe defaults
 */
export function getBotEnvironment() {
    try {
        return BotEnvSchema.parse(process.env);
    }
    catch (error) {
        logValidationWarning('bot', error);
        return {
            NODE_ENV: 'development',
            SOLANA_RPC_URL: 'https://api.devnet.solana.com',
            SOLANA_WS_URL: undefined,
            LOG_LEVEL: 'info',
            MOCK_MODE: true,
            BOT_PORT: 4001,
            TELEGRAM_BOT_TOKEN: undefined,
            ALLOWLIST_IDS: [],
            DEFAULT_BAND_BPS: 100,
            STRATEGY_URL: 'http://localhost:4000',
            COMMAND_RATE_LIMIT_PER_MINUTE: 20,
            MAX_STRATEGIES_PER_USER: 5,
        };
    }
}
/**
 * Get web environment with safe defaults
 */
export function getWebEnvironment() {
    try {
        return WebEnvSchema.parse(process.env);
    }
    catch (error) {
        logValidationWarning('web', error);
        return {
            NEXT_PUBLIC_STRATEGY_URL: 'http://localhost:4000',
            NEXT_PUBLIC_SOLANA_RPC_URL: 'https://api.devnet.solana.com',
            NEXT_PUBLIC_SOLANA_NETWORK: 'devnet',
            NEXT_PUBLIC_CLUSTER: 'devnet',
        };
    }
}
// Network configuration for the UI
export const NETWORKS = {
    devnet: {
        rpcUrl: 'https://api.devnet.solana.com',
        wsUrl: 'wss://api.devnet.solana.com',
    },
    testnet: {
        rpcUrl: 'https://api.testnet.solana.com',
        wsUrl: 'wss://api.testnet.solana.com',
    },
    'mainnet-beta': {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        wsUrl: 'wss://api.mainnet-beta.solana.com',
    },
};
