import { z } from 'zod';

export const AdvancedKind = z.enum(['limitBuy', 'limitSell', 'stopLoss']);
export type AdvancedKind = z.infer<typeof AdvancedKind>;

export const AdvancedPlanReq = z.object({
  wallet: z.string().min(32),
  pool: z.string().min(1),
  spec: z.object({
    kind: AdvancedKind,
    targetPrice: z.number().positive(),
    sizeQuote: z.string().optional(),
    sizeBase: z.string().optional(),
  }),
});
export type AdvancedPlanReq = z.infer<typeof AdvancedPlanReq>;

export const AdvancedPlanResp = z.object({
  bins: z.array(z.number().int()),
  singleSided: z.enum(['base', 'quote']),
  note: z.string(),
});
export type AdvancedPlanResp = z.infer<typeof AdvancedPlanResp>;

export const AdvancedArmReq = AdvancedPlanReq;
export type AdvancedArmReq = z.infer<typeof AdvancedArmReq>;

export const AdvancedArmResp = z.object({ txid: z.string() });
export type AdvancedArmResp = z.infer<typeof AdvancedArmResp>;

export const AdvancedDisarmReq = z.object({
  wallet: z.string().min(32),
  pool: z.string().min(1),
});
export type AdvancedDisarmReq = z.infer<typeof AdvancedDisarmReq>;

export const AdvancedDisarmResp = z.object({ txid: z.string() });
export type AdvancedDisarmResp = z.infer<typeof AdvancedDisarmResp>;
