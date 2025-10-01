"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  listPools,
  getUserPositions,
  planRebalance,
  executeRebalance,
  type PoolRef,
  type UserPosition,
} from '@dlmm-copilot/core';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Coins,
  ExternalLink,
  Globe,
  Plus,
  TrendingUp,
  Wallet
} from 'lucide-react'
import { 
  SkeletonRow,
  FormRow
} from '@/components/ui';
import { Button } from '@/components/ui/button';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const linkCodeResponseSchema = z.object({
  code: z.string(),
  deeplink: z.string().url().optional(),
  note: z.string().optional(),
});

type LinkCodeState = z.infer<typeof linkCodeResponseSchema>;

export default function DashboardPage(): JSX.Element {
  const { connected, publicKey } = useWallet();
  const [pools, setPools] = useState<PoolRef[]>([]);
  const [poolStatus, setPoolStatus] = useState<LoadState>('idle');
  const [poolError, setPoolError] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<string>('');

  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [positionsStatus, setPositionsStatus] = useState<LoadState>('idle');
  const [positionsError, setPositionsError] = useState<string | null>(null);

  const [bandBps, setBandBps] = useState<number>(100);
  const [auto, setAuto] = useState<boolean>(false);
  const [isRebalancing, setIsRebalancing] = useState<boolean>(false);
  const [linkInFlight, setLinkInFlight] = useState<boolean>(false);
  const [linkCode, setLinkCode] = useState<LinkCodeState | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnToastId = useRef<string | undefined>(undefined);

  const walletAddress = useMemo(() => publicKey?.toBase58() ?? '', [publicKey]);
  const activePool = useMemo(
    () => selectedPool || pools[0]?.address || '',
    [selectedPool, pools],
  );

  const formatAmount = (value: string): string => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString();
    }
    return value;
  };

  useEffect(() => {
    let isMounted = true;
    setPoolStatus('loading');
    setPoolError(null);
    void listPools()
      .then((result) => {
        if (!isMounted) return;
        if (result.ok) {
          setPools(result.value);
          setPoolStatus('ready');
          setSelectedPool((previous) => {
            if (previous) {
              return previous;
            }
            return result.value[0]?.address ?? '';
          });
        } else {
          setPoolError(result.detail ?? `Unable to load pools (${result.error})`);
          setPoolStatus('error');
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setPoolError(error instanceof Error ? error.message : 'Failed to load pools');
        setPoolStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setPositions([]);
      setPositionsStatus('idle');
      setPositionsError(null);
      return;
    }

    let isMounted = true;
    setPositionsStatus('loading');
    setPositionsError(null);

    void getUserPositions(walletAddress)
      .then((result) => {
        if (!isMounted) return;
        if (result.ok) {
          setPositions(result.value);
          setPositionsStatus('ready');
        } else {
          setPositions([]);
          setPositionsError(result.detail ?? `Unable to fetch positions (${result.error})`);
          setPositionsStatus('error');
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setPositions([]);
        setPositionsError(error instanceof Error ? error.message : 'Failed to fetch positions');
        setPositionsStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, [walletAddress]);

  const dismissOutOfBandToast = useCallback(() => {
    if (warnToastId.current) {
      toast.dismiss(warnToastId.current);
      warnToastId.current = undefined;
    }
  }, []);

  const showOutOfBandToast = useCallback(
    (rebalance: () => void) => {
      if (warnToastId.current) {
        return;
      }
      warnToastId.current = toast.custom((t) => (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div className="font-medium">Out of band</div>
          <div className="mt-1">Price moved outside your configured band.</div>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              warnToastId.current = undefined;
              rebalance();
            }}
            className="mt-2 rounded bg-amber-500 px-3 py-1 text-slate-900"
          >
            Rebalance Now
          </button>
        </div>
      ), { duration: Infinity });
    },
    [],
  );

  const handleRebalanceNow = useCallback(async () => {
    if (!connected || !walletAddress || !activePool) {
      toast.error('Connect your wallet and select a pool to rebalance.');
      return;
    }
    if (bandBps < 1) {
      toast.error('Band width must be at least 1 bps.');
      return;
    }

    setIsRebalancing(true);
    const body = { wallet: walletAddress, pool: activePool, bandBps };
    try {
      const result = await executeRebalance(body);
      if (result.ok) {
        dismissOutOfBandToast();
        const firstTx = result.value.txids[0] ?? 'unknown';
        if (firstTx.startsWith('MOCK-')) {
          toast.success(`Mock rebalance executed. Tx: ${firstTx}`);
        } else {
          toast.success(`Rebalance submitted. Tx: ${firstTx}`);
        }
      } else {
        toast.error(result.problem.detail ?? result.problem.title);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unexpected error during rebalance.';
      toast.error(message);
    } finally {
      setIsRebalancing(false);
    }
  }, [connected, walletAddress, activePool, bandBps, dismissOutOfBandToast]);

  useEffect(() => {
    if (!connected) {
      setAuto(false);
      dismissOutOfBandToast();
    }
  }, [connected, dismissOutOfBandToast]);

  useEffect(() => {
    if (!auto) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      dismissOutOfBandToast();
      return;
    }

    if (!connected || !walletAddress || !activePool || bandBps < 1) {
      return;
    }

    let cancelled = false;

    const evaluateBand = async () => {
      const body = { wallet: walletAddress, pool: activePool, bandBps };
      const result = await planRebalance(body);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        if (result.value.inBand) {
          dismissOutOfBandToast();
        } else {
          showOutOfBandToast(() => {
            void handleRebalanceNow();
          });
        }
      } else {
        toast.error(result.problem.detail ?? result.problem.title);
      }
    };

    void evaluateBand();
    const intervalId = setInterval(() => {
      void evaluateBand();
    }, 30_000);
    pollIntervalRef.current = intervalId;

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [auto, connected, walletAddress, activePool, bandBps, dismissOutOfBandToast, showOutOfBandToast, handleRebalanceNow]);

  useEffect(() => {
    setLinkCode(null);
  }, [walletAddress]);

  const strategyBaseUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_STRATEGY_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
    [],
  );

  const requestLinkCode = useCallback(
    async (wallet: string): Promise<LinkCodeState> => {
      const response = await fetch(`${strategyBaseUrl}/bot/link-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ wallet }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const detail =
          typeof payload === 'object' && payload && 'detail' in payload
            ? String((payload as { detail?: unknown }).detail)
            : response.statusText || 'Link request failed';
        throw new Error(detail);
      }

      const parsed = linkCodeResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }
      return parsed.data;
    },
    [strategyBaseUrl],
  );

  const handleLinkTelegram = useCallback(async () => {
    if (!connected || !walletAddress) {
      toast.error('Connect your wallet to generate a link code.');
      return;
    }
    setLinkInFlight(true);
    try {
      const result = await requestLinkCode(walletAddress);
      setLinkCode(result);
      toast.success('Link code generated.');
    } catch (error: unknown) {
      setLinkCode(null);
      const message = error instanceof Error ? error.message : 'Failed to generate link code.';
      toast.error(message);
    } finally {
      setLinkInFlight(false);
    }
  }, [connected, requestLinkCode, walletAddress]);

  const handleCopyCode = useCallback(async () => {
    if (!linkCode?.code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(linkCode.code);
      toast.success('Code copied to clipboard');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to copy code';
      toast.error(message);
    }
  }, [linkCode]);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        duration: 0.6
      }
    }
  };



  return (
    <>
      <style jsx>{`
        .quick-actions-card {
          background-color: rgb(30, 41, 59) !important;
          border: 1px solid rgba(100, 116, 139, 0.5) !important;
          border-radius: 0.75rem !important;
          padding: 1.5rem !important;
          cursor: pointer !important;
          display: block !important;
          text-decoration: none !important;
          color: inherit !important;
          min-height: 120px !important;
          transition: all 0.2s ease !important;
        }
        .quick-actions-card:hover {
          background-color: rgb(51, 65, 85) !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
          transform: translateY(-2px) !important;
        }
        .quick-actions-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 1.5rem !important;
          width: 100% !important;
        }
        .quick-actions-link {
          text-decoration: none !important;
          color: inherit !important;
        }
        .section-card {
          background: rgba(15, 23, 42, 0.6) !important;
          border: 1px solid rgba(51, 65, 85, 0.5) !important;
          border-radius: 0.75rem !important;
          padding: 2rem !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
          margin-bottom: 2rem !important;
        }
        .section-header {
          margin-bottom: 2rem !important;
        }
        .section-title {
          font-size: 1.5rem !important;
          font-weight: bold !important;
          color: rgb(248, 250, 252) !important;
          margin-bottom: 0.75rem !important;
        }
        .section-description {
          font-size: 1.125rem !important;
          color: rgb(203, 213, 225) !important;
        }
        .pool-card {
          background-color: rgb(30, 41, 59) !important;
          border: 1px solid rgba(100, 116, 139, 0.5) !important;
          border-radius: 0.75rem !important;
          padding: 1.5rem !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
        }
        .pool-card:hover {
          background-color: rgb(51, 65, 85) !important;
          border-color: rgba(100, 116, 139, 0.7) !important;
          transform: translateY(-2px) !important;
        }
        .pool-card.selected {
          border-color: rgba(59, 130, 246, 0.5) !important;
          background-color: rgba(59, 130, 246, 0.1) !important;
        }
      `}</style>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8 min-h-screen"
        style={{
          minHeight: '100vh',
          paddingTop: '2rem',
          paddingBottom: '2rem'
        }}
      >
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-6 mb-16"
          style={{
            textAlign: 'center',
            marginBottom: '4rem',
            padding: '2rem 0'
          }}
        >
          <h1 
            className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"
            style={{
              fontSize: '3.5rem',
              fontWeight: 'bold',
              background: 'linear-gradient(to right, rgb(96 165 250), rgb(168 85 247))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1.5rem'
            }}
          >
            Saros DLMM Dashboard
          </h1>
          <p 
            className="text-xl text-slate-300 max-w-4xl mx-auto leading-relaxed"
            style={{
              fontSize: '1.25rem',
              color: 'rgb(203 213 225)',
              maxWidth: '56rem',
              margin: '0 auto',
              lineHeight: '1.75'
            }}
          >
            Manage your Saros DLMM liquidity positions, rebalance bands, and place advanced orders directly from this professional dashboard.
          </p>
        </motion.div>

        {/* Key Stats Row */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 mb-16"
          style={{
            display: 'grid',
            gap: '2rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            marginBottom: '4rem'
          }}
        >
          <motion.div 
            className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 hover:bg-slate-800/60 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl"
            whileHover={{ scale: 1.03, y: -4 }}
            style={{
              background: 'rgba(15 23 42 / 0.6)',
              border: '1px solid rgba(51 65 85 / 0.5)',
              borderRadius: '0.75rem',
              padding: '2rem',
              boxShadow: '0 10px 15px -3px rgba(0 0 0 / 0.1), 0 4px 6px -2px rgba(0 0 0 / 0.05)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <Wallet className="w-10 h-10 text-blue-400" />
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {connected ? "Connected" : "Disconnected"}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Wallet Status</h3>
              <p className="text-lg font-semibold text-slate-50">
                {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "No wallet"}
              </p>
            </div>
          </motion.div>

          <motion.div 
            className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 hover:bg-slate-800/60 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl"
            whileHover={{ scale: 1.03, y: -4 }}
            style={{
              background: 'rgba(15 23 42 / 0.6)',
              border: '1px solid rgba(51 65 85 / 0.5)',
              borderRadius: '0.75rem',
              padding: '2rem',
              boxShadow: '0 10px 15px -3px rgba(0 0 0 / 0.1), 0 4px 6px -2px rgba(0 0 0 / 0.05)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <Globe className="w-10 h-10 text-purple-400" />
              <div className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs font-medium">
                {process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet'}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Network</h3>
              <p className="text-lg font-semibold text-slate-50">Solana cluster</p>
            </div>
          </motion.div>

          <motion.div 
            className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 hover:bg-slate-800/60 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl"
            whileHover={{ scale: 1.03, y: -4 }}
            style={{
              background: 'rgba(15 23 42 / 0.6)',
              border: '1px solid rgba(51 65 85 / 0.5)',
              borderRadius: '0.75rem',
              padding: '2rem',
              boxShadow: '0 10px 15px -3px rgba(0 0 0 / 0.1), 0 4px 6px -2px rgba(0 0 0 / 0.05)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <TrendingUp className="w-10 h-10 text-green-400" />
              <div className="text-3xl font-bold text-slate-50">
                {positionsStatus === 'loading' ? '...' : positions.length}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Total Positions</h3>
              <p className="text-lg font-semibold text-slate-50">Active LP positions</p>
            </div>
          </motion.div>

          <motion.div 
            className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 hover:bg-slate-800/60 hover:border-slate-600/70 transition-all duration-300 shadow-lg hover:shadow-xl"
            whileHover={{ scale: 1.03, y: -4 }}
            style={{
              background: 'rgba(15 23 42 / 0.6)',
              border: '1px solid rgba(51 65 85 / 0.5)',
              borderRadius: '0.75rem',
              padding: '2rem',
              boxShadow: '0 10px 15px -3px rgba(0 0 0 / 0.1), 0 4px 6px -2px rgba(0 0 0 / 0.05)'
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <Activity className="w-10 h-10 text-cyan-400" />
              <div className="text-3xl font-bold text-slate-50">
                {poolStatus === 'loading' ? '...' : pools.length}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Active Pools</h3>
              <p className="text-lg font-semibold text-slate-50">Available pools</p>
            </div>
          </motion.div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column */}
          <div className="space-y-8">
            
            {/* Quick Actions */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-slate-900/30 border border-slate-700/50 rounded-xl p-8 shadow-lg"
              style={{
                background: 'rgba(15, 23, 42, 0.6) !important',
                border: '1px solid rgba(51, 65, 85, 0.5) !important',
                borderRadius: '0.75rem !important',
                padding: '2rem !important',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1) !important',
                marginBottom: '2rem !important',
                minHeight: '300px !important'
              }}
            >
              <div className="mb-8" style={{ marginBottom: '2rem !important' }}>
                <h2 
                  className="text-2xl font-bold text-slate-50 mb-3"
                  style={{
                    fontSize: '1.5rem !important',
                    fontWeight: 'bold !important',
                    color: 'rgb(248, 250, 252) !important',
                    marginBottom: '0.75rem !important'
                  }}
                >
                  Quick Actions
                </h2>
                <p 
                  className="text-slate-300 text-lg"
                  style={{
                    fontSize: '1.125rem !important',
                    color: 'rgb(203, 213, 225) !important'
                  }}
                >
                  Common tasks and tools for managing your liquidity positions
                </p>
              </div>
              <div className="quick-actions-grid">
                <Link href="/positions/new" className="quick-actions-link">
                  <div className="quick-actions-card">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-3 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/30 transition-colors">
                        <Plus className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-slate-100 text-lg">
                          New Position
                        </div>
                        <div className="text-sm text-slate-400 mt-1">
                          Create LP position
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
                
                <Link href="/orders" className="quick-actions-link">
                  <div className="quick-actions-card">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-3 bg-green-500/20 rounded-lg group-hover:bg-green-500/30 transition-colors">
                        <Activity className="w-8 h-8 text-green-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-slate-100 text-lg">
                          Orders
                        </div>
                        <div className="text-sm text-slate-400 mt-1">
                          Manage orders
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
                
                <Link href="/analytics" className="quick-actions-link">
                  <div className="quick-actions-card">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-3 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-colors">
                        <TrendingUp className="w-8 h-8 text-purple-400 group-hover:scale-110 transition-transform" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-slate-100 text-lg">
                          Analytics
                        </div>
                        <div className="text-sm text-slate-400 mt-1">
                          View insights
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
                
                <div className="quick-actions-card" style={{ opacity: 0.5 }}>
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-3 bg-slate-600/20 rounded-lg">
                      <Wallet className="w-8 h-8 text-slate-500" />
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-slate-300 text-lg">
                        Portfolio
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        Coming soon
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
          
          {/* Right Column */}
          <div className="space-y-8">
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '0.75rem',
                padding: '2rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                marginBottom: '2rem',
                minHeight: '200px',
                display: 'block',
                position: 'relative',
                zIndex: 1
              }}
            >
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              style={{ background: 'transparent', border: 'none', padding: 0 }}
            >
              <div 
                className="flex items-center justify-between mb-8"
                style={{ marginBottom: '2rem !important' }}
              >
                <div>
                  <h2 
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: 'rgb(248, 250, 252)',
                      marginBottom: '0.75rem',
                      fontFamily: 'inherit'
                    }}
                  >
                    Telegram Bot Linking
                  </h2>
                  <p 
                    style={{
                      fontSize: '1.125rem',
                      color: 'rgb(203, 213, 225)',
                      lineHeight: '1.5'
                    }}
                  >
                    Generate a one-time code to connect this wallet to the Telegram bot.
                  </p>
                </div>
                <Button
                  onClick={() => void handleLinkTelegram()}
                  disabled={!connected || linkInFlight}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3"
                >
                  <ExternalLink className="w-4 h-4" />
                  {linkInFlight ? 'Generating…' : 'Link Telegram'}
                </Button>
              </div>
              <div>
                {!connected && (
                  <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/10">
                    <p className="text-amber-300 text-sm">Connect your wallet to generate a link code.</p>
                  </div>
                )}
                {linkCode && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg px-6 py-3 font-mono text-lg text-slate-50">
                        {linkCode.code}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopyCode()}
                        className="bg-slate-700/50 hover:bg-slate-600/50 border-slate-600"
                      >
                        Copy Code
                      </Button>
                    </div>
                    {linkCode.deeplink ? (
                      <a
                        href={linkCode.deeplink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in Telegram
                      </a>
                    ) : (
                      <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-600/30">
                        <p className="text-slate-300 text-sm">
                          Send <code className="px-2 py-1 rounded bg-slate-700/50 font-mono text-xs text-slate-200">/link {linkCode.code}</code> to your bot to finish linking.
                        </p>
                      </div>
                    )}
                    {linkCode.note && (
                      <p className="text-slate-400 text-sm">{linkCode.note}</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
            </div>
            
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '0.75rem',
                padding: '2rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                marginBottom: '2rem',
                minHeight: '200px',
                display: 'block',
                position: 'relative',
                zIndex: 1
              }}
            >
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              style={{ background: 'transparent', border: 'none', padding: 0 }}
            >
              <div 
                className="flex items-center justify-between mb-8"
                style={{ marginBottom: '2rem !important' }}
              >
                <div>
                  <h2 
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: 'rgb(248, 250, 252)',
                      marginBottom: '0.75rem',
                      fontFamily: 'inherit'
                    }}
                  >
                    Available Pools
                  </h2>
                  <p 
                    style={{
                      fontSize: '1.125rem',
                      color: 'rgb(203, 213, 225)',
                      lineHeight: '1.5'
                    }}
                  >
                    Select and manage liquidity pools
                  </p>
                </div>
                {poolStatus === 'ready' && pools.length > 0 && (
                  <select
                    className="bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-slate-50 min-w-[300px]"
                    value={selectedPool}
                    onChange={(event) => setSelectedPool(event.target.value)}
                  >
                    {pools.map((pool) => (
                      <option key={pool.address} value={pool.address} className="bg-slate-800 text-slate-50">
                        {pool.tokenA} / {pool.tokenB} • {pool.address.slice(0, 8)}...
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-4">
                {poolStatus === 'loading' && (
                  <div className="space-y-3">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </div>
                )}
            {poolStatus === 'error' && (
              <div className="flex items-center gap-2 p-4 rounded-lg border border-destructive/20 bg-destructive/10">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <p className="text-sm text-destructive">{poolError ?? 'Unable to load pools.'}</p>
              </div>
            )}
                {poolStatus === 'ready' && pools.length === 0 && (
                  <div className="text-center py-12">
                    <Coins className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400 text-lg">No pools found. Try again later.</p>
                  </div>
                )}
                {poolStatus === 'ready' && pools.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {pools.map((pool) => (
                      <motion.div
                        key={pool.address}
                        className={`bg-slate-800/50 border rounded-xl p-6 transition-all duration-200 cursor-pointer ${
                          selectedPool === pool.address 
                            ? 'border-blue-500/50 bg-blue-500/10' 
                            : 'border-slate-600/50 hover:border-slate-500/70 hover:bg-slate-700/50'
                        }`}
                        style={{
                          backgroundColor: selectedPool === pool.address 
                            ? 'rgba(59, 130, 246, 0.1) !important' 
                            : 'rgb(30, 41, 59) !important',
                          border: selectedPool === pool.address 
                            ? '1px solid rgba(59, 130, 246, 0.5) !important' 
                            : '1px solid rgba(100, 116, 139, 0.5) !important',
                          borderRadius: '0.75rem !important',
                          padding: '1.5rem !important',
                          cursor: 'pointer !important',
                          transition: 'all 0.2s ease !important'
                        }}
                        onClick={() => setSelectedPool(pool.address)}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Coins className="w-5 h-5 text-blue-400" />
                          </div>
                          <span className="font-semibold text-slate-50 text-lg">{pool.tokenA} / {pool.tokenB}</span>
                        </div>
                        <div className="space-y-2">
                          <span className="font-mono text-sm text-slate-300 block">{pool.address}</span>
                          <span className="text-sm text-slate-400">
                            Decimals: {pool.decimalsA} / {pool.decimalsB}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '0.75rem',
                padding: '2rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                marginBottom: '2rem',
                minHeight: '200px',
                display: 'block',
                position: 'relative',
                zIndex: 1
              }}
            >
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              style={{ background: 'transparent', border: 'none', padding: 0 }}
            >
              <div style={{ marginBottom: '2rem !important' }}>
                <h2 
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: 'rgb(248, 250, 252)',
                    marginBottom: '0.75rem',
                    fontFamily: 'inherit'
                  }}
                >
                  Band Control
                </h2>
                <p 
                  style={{
                    fontSize: '1.125rem',
                    color: 'rgb(203, 213, 225)',
                    lineHeight: '1.5'
                  }}
                >
                  Configure liquidity position parameters
                </p>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-6">
                  <FormRow
                    label="Band Width (bps)"
                    tooltip="Percentage range around mid price for rebalancing trigger"
                    required
                  >
                    <input
                      type="number"
                      min={1}
                      max={10_000}
                      value={bandBps}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setBandBps(Number.isFinite(next) ? next : 0);
                      }}
                      className="bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-slate-50 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="100"
                    />
              </FormRow>

                  <FormRow
                    label="Auto Rebalance"
                    tooltip="Automatically rebalance when price moves outside the configured band"
                  >
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={auto}
                        disabled={!connected || !activePool}
                        onChange={(event) => setAuto(event.target.checked)}
                        className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <span className="text-slate-300">Enable automatic rebalancing (30s interval)</span>
                    </label>
                  </FormRow>
                </div>

                <div className="flex flex-col justify-center space-y-6">
                  <Button
                    disabled={!connected || !activePool || bandBps < 1 || isRebalancing}
                    onClick={() => void handleRebalanceNow()}
                    className="w-full bg-green-600 hover:bg-green-500 text-white px-8 py-4 text-lg font-semibold"
                    size="lg"
                  >
                    {isRebalancing ? 'Rebalancing…' : 'Rebalance Now'}
                  </Button>

                  {!connected && (
                    <div className="p-6 rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <div className="flex items-center gap-3 text-amber-300 mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-semibold">Wallet Required</span>
                      </div>
                      <p className="text-sm text-amber-300/80">
                        Connect your wallet to enable rebalancing controls.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
            </div>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(51, 65, 85, 0.5)',
                borderRadius: '0.75rem',
                padding: '2rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                marginBottom: '2rem',
                minHeight: '200px',
                display: 'block',
                position: 'relative',
                zIndex: 1
              }}
            >
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
              style={{ background: 'transparent', border: 'none', padding: 0 }}
            >
              <div 
                className="flex items-center justify-between mb-8"
                style={{ marginBottom: '2rem !important' }}
              >
                <div>
                  <h2 
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      color: 'rgb(248, 250, 252)',
                      marginBottom: '0.75rem',
                      fontFamily: 'inherit'
                    }}
                  >
                    My Positions
                  </h2>
                  <p 
                    style={{
                      fontSize: '1.125rem',
                      color: 'rgb(203, 213, 225)',
                      lineHeight: '1.5'
                    }}
                  >
                    View and manage your active liquidity positions
                  </p>
                </div>
                <Link href="/positions/new">
                  <Button 
                    size="sm" 
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Position
                  </Button>
                </Link>
              </div>
          <div className="space-y-4">
            {!connected && (
              <div className="text-center py-8">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Connect your wallet to view positions.</p>
              </div>
            )}
            
            {connected && positionsStatus === 'loading' && (
              <div className="space-y-3">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}
            
            {connected && positionsStatus === 'error' && (
              <div className="flex items-center gap-2 p-4 rounded-lg border border-destructive/20 bg-destructive/10">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <p className="text-sm text-destructive">{positionsError ?? 'Unable to fetch positions.'}</p>
              </div>
            )}
            
            {connected && positionsStatus === 'ready' && positions.length === 0 && (
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No positions found for this wallet.</p>
                <Link href="/positions/new">
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Position
                  </Button>
                </Link>
              </div>
            )}
            
            {connected && positionsStatus === 'ready' && positions.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pool</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bin Range</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Base Amount</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Quote Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card/50">
                    {positions.map((position, index) => (
                      <motion.tr 
                        key={`${position.pool}-${index}`}
                        className="hover:bg-muted/50 transition-colors"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs truncate max-w-[200px]">
                            {position.pool}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm">
                            <span className="font-mono">{position.binLower}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono">{position.binUpper}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {formatAmount(position.amountBase)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {formatAmount(position.amountQuote)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>
            </motion.div>
            </div>
          </div>
        </div>
    </motion.div>
    </>
  );
}
