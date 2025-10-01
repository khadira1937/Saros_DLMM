import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// Solana address validation
const SolanaAddressSchema = z.string().refine(
  (value: string) => {
    try {
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid Solana address' }
);

// DLMM Position schema
export const DLMMPositionSchema = z.object({
  publicKey: SolanaAddressSchema,
  lbPair: SolanaAddressSchema,
  owner: SolanaAddressSchema,
  liquidityMinted: z.string().transform((val: string) => BigInt(val)),
  positionBinData: z.array(z.object({
    binId: z.number(),
    xAmount: z.string().transform((val: string) => BigInt(val)),
    yAmount: z.string().transform((val: string) => BigInt(val)),
    supply: z.string().transform((val: string) => BigInt(val)),
    version: z.number(),
    price: z.number(),
    pricePerToken: z.number(),
  })),
});

// DLMM Pair schema
export const DLMMPairSchema = z.object({
  publicKey: SolanaAddressSchema,
  name: z.string(),
  mintX: SolanaAddressSchema,
  mintY: SolanaAddressSchema,
  reserveX: z.string().transform((val: string) => BigInt(val)),
  reserveY: z.string().transform((val: string) => BigInt(val)),
  binStep: z.number(),
  baseFactor: z.number(),
  filterLifetime: z.number(),
  decayPeriod: z.number(),
  reductionFactor: z.number(),
  variableFeeControl: z.number(),
  maxVolatilityAccumulated: z.number(),
  minBinId: z.number(),
  maxBinId: z.number(),
  protocolFee: z.number(),
  lastUpdatedAt: z.number(),
  activeId: z.number(),
});

// Strategy configuration
export const StrategyConfigSchema = z.object({
  name: z.string().min(1),
  pairAddress: SolanaAddressSchema,
  enabled: z.boolean().default(true),
  rebalanceThreshold: z.number().min(0).max(1).default(0.1),
  maxSlippage: z.number().min(0).max(1).default(0.01),
  minLiquidity: z.string().transform((val: string) => BigInt(val)),
  maxLiquidity: z.string().transform((val: string) => BigInt(val)),
  targetRangeWidth: z.number().int().min(1).default(20),
  rebalanceInterval: z.number().int().min(60).default(300), // seconds
});

// Rebalance order
export const RebalanceOrderSchema = z.object({
  id: z.string().uuid(),
  strategyId: z.string(),
  type: z.enum(['rebalance', 'close', 'adjust']),
  status: z.enum(['pending', 'executing', 'completed', 'failed']),
  currentPosition: z.array(z.object({
    binId: z.number(),
    amount: z.string().transform((val: string) => BigInt(val)),
  })),
  targetPosition: z.array(z.object({
    binId: z.number(),
    amount: z.string().transform((val: string) => BigInt(val)),
  })),
  estimatedGas: z.string().transform((val: string) => BigInt(val)),
  maxSlippage: z.number(),
  createdAt: z.date(),
  executedAt: z.date().optional(),
  txSignature: z.string().optional(),
  error: z.string().optional(),
});

// User preferences
export const UserPreferencesSchema = z.object({
  telegramUserId: z.string(),
  walletAddress: SolanaAddressSchema.optional(),
  notifications: z.object({
    rebalances: z.boolean().default(true),
    priceAlerts: z.boolean().default(true),
    errors: z.boolean().default(true),
  }),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  autoRebalance: z.boolean().default(false),
});

// Export types
export type DLMMPosition = z.infer<typeof DLMMPositionSchema>;
export type DLMMPair = z.infer<typeof DLMMPairSchema>;
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;
export type RebalanceOrder = z.infer<typeof RebalanceOrderSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// API request/response schemas
export const GetPositionsRequestSchema = z.object({
  walletAddress: SolanaAddressSchema,
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
});

export const CreateStrategyRequestSchema = StrategyConfigSchema.omit({ name: true }).extend({
  name: z.string().min(1).max(50),
});

export const UpdateStrategyRequestSchema = CreateStrategyRequestSchema.partial();

export type GetPositionsRequest = z.infer<typeof GetPositionsRequestSchema>;
export type CreateStrategyRequest = z.infer<typeof CreateStrategyRequestSchema>;
export type UpdateStrategyRequest = z.infer<typeof UpdateStrategyRequestSchema>;