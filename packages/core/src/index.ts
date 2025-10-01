// Core package exports
export * from './config';
export * from './types';
export * from './utils';
export * from './dlmm';
export * from './dlmmClient';
export {
  planRebalance,
  executeRebalance,
  planAdvanced,
  armAdvanced,
  disarmAdvanced,
  createLinkCode,
  consumeLink,
  getWalletByTelegram,
} from './strategyClient';
export type {
  PlanBody,
  PlanResp,
  ExecuteBody,
  ExecuteResp,
  Problem as StrategyProblem,
  Result as StrategyResult,
  AdvKind,
  AdvPlanReq,
  AdvPlanResp,
  AdvArmReq,
  AdvArmResp,
  AdvDisarmReq,
  AdvDisarmResp,
  LinkCodeReq,
  LinkCodeResp,
  ConsumeLinkReq,
  ConsumeLinkResp,
  WalletByTelegramResp,
} from './strategyClient';

// Re-export commonly used Solana types for convenience
export { PublicKey, Connection } from '@solana/web3.js';
