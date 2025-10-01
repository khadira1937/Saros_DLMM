"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import Link from 'next/link';
import toast from "react-hot-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from 'framer-motion';
import {
  listPools,
  currentMidPrice,
  getUserPositions,
  type PoolRef,
  type UserPosition,
} from "@dlmm-copilot/core";
import Papa from "papaparse";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { 
  ChevronLeft,
  Upload,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const REQUIRED_HEADERS = ["timestamp", "open", "high", "low", "close"] as const;
const FEE_PER_EXIT = 0.0002; // 2 bps

type CandleRow = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

type BacktestResult = {
  equitySeries: Array<{ t: number; equity: number }>;
  exits: number;
  totalFeesPct: number;
  finalEquity: number;
};

type CsvRow = {
  timestamp?: number | string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  [key: string]: unknown;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function toMillis(rawTimestamp: number): number {
  return rawTimestamp > 1_000_000_000_000 ? rawTimestamp : rawTimestamp * 1000;
}

function runBacktest(rows: CandleRow[], bandBps: number, cooldownSec: number): BacktestResult {
  const equitySeries: Array<{ t: number; equity: number }> = [];
  let equity = 1.0;
  let exits = 0;

  const ratio = bandBps / 10_000;
  const toBand = (price: number) => ({ lower: price * (1 - ratio), upper: price * (1 + ratio) });

  let lastExitTs = -Infinity;
  let band = toBand(rows[0]?.c ?? 1);

  for (const row of rows) {
    if (!Number.isFinite(row.t) || !Number.isFinite(row.h) || !Number.isFinite(row.l) || !Number.isFinite(row.c)) {
      continue;
    }

    const canExit = row.t >= lastExitTs + cooldownSec * 1000;
    const hitUpper = row.h > band.upper;
    const hitLower = row.l < band.lower;

    if (canExit && (hitUpper || hitLower)) {
      exits += 1;
      lastExitTs = row.t;
      const gain = equity * FEE_PER_EXIT;
      equity += gain;
      band = toBand(row.c);
    }

    equitySeries.push({ t: row.t, equity: Number(equity.toFixed(6)) });
  }

  const totalFeesPct = equity > 0 ? (equity - 1.0) * 100 : 0;

  return {
    equitySeries,
    exits,
    totalFeesPct: Number(totalFeesPct.toFixed(4)),
    finalEquity: Number(equity.toFixed(6)),
  };
}

export default function AnalyticsPage(): JSX.Element {
  const { connected, publicKey } = useWallet();
  const walletAddress = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  const [pools, setPools] = useState<PoolRef[]>([]);
  const [selectedPool, setSelectedPool] = useState<string>("");
  const [poolsLoading, setPoolsLoading] = useState<boolean>(false);
  const [poolsError, setPoolsError] = useState<string | null>(null);

  const [midPrice, setMidPrice] = useState<number | null>(null);
  const [midPriceLoading, setMidPriceLoading] = useState<boolean>(false);

  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState<boolean>(false);

  const [bandBps, setBandBps] = useState<number>(100);
  const [cooldownSec, setCooldownSec] = useState<number>(900);

  const [backtestRows, setBacktestRows] = useState<CandleRow[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [csvName, setCsvName] = useState<string>("");
  const [csvLoading, setCsvLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setPoolsLoading(true);
    setPoolsError(null);

    void listPools()
      .then((result) => {
        if (!isMounted) return;
        if (result.ok) {
          setPools(result.value);
          setSelectedPool((previous) => {
            if (previous && previous.length > 0) {
              return previous;
            }
            return result.value[0]?.address ?? "";
          });
          setPoolsLoading(false);
        } else {
          setPoolsError(result.detail ?? `Unable to load pools (${result.error})`);
          setPoolsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Failed to load pools.";
        setPoolsError(message);
        setPoolsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPool) {
      setMidPrice(null);
      return;
    }
    let isMounted = true;
    setMidPriceLoading(true);

    void currentMidPrice(selectedPool)
      .then((result) => {
        if (!isMounted) return;
        if (result.ok) {
          setMidPrice(result.value);
        } else {
          setMidPrice(null);
        }
        setMidPriceLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setMidPrice(null);
        setMidPriceLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPool]);

  useEffect(() => {
    if (!walletAddress) {
      setPositions([]);
      setPositionsLoading(false);
      return;
    }

    let isMounted = true;
    setPositionsLoading(true);

    void getUserPositions(walletAddress)
      .then((result) => {
        if (!isMounted) return;
        if (result.ok) {
          setPositions(result.value);
        } else {
          setPositions([]);
        }
        setPositionsLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setPositions([]);
        setPositionsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [walletAddress]);

  useEffect(() => {
    if (backtestRows.length === 0) {
      setBacktestResult(null);
      return;
    }
    const simulation = runBacktest(backtestRows, Math.max(1, bandBps), Math.max(1, cooldownSec));
    setBacktestResult(simulation);
  }, [backtestRows, bandBps, cooldownSec]);

  const poolOptions = useMemo(
    () => pools.map((pool) => ({ value: pool.address, label: pool.address })),
    [pools],
  );

  const poolPositions = useMemo(
    () => positions.filter((position) => position.pool === selectedPool),
    [positions, selectedPool],
  );

  const activeBand = useMemo(() => {
    if (poolPositions.length === 0) {
      return null;
    }
    let lower = Number.POSITIVE_INFINITY;
    let upper = Number.NEGATIVE_INFINITY;
    for (const position of poolPositions) {
      if (Number.isFinite(position.binLower)) {
        lower = Math.min(lower, position.binLower);
      }
      if (Number.isFinite(position.binUpper)) {
        upper = Math.max(upper, position.binUpper);
      }
    }
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
      return null;
    }
    return { lower, upper };
  }, [poolPositions]);

  const totalFeesQuote = useMemo(() => {
    if (midPrice === null) {
      return 0;
    }
    return poolPositions.reduce((accumulator, position) => {
      const feeBase = toNumber(position.feesBase) ?? 0;
      const feeQuote = toNumber(position.feesQuote) ?? 0;
      return accumulator + feeQuote + feeBase * midPrice;
    }, 0);
  }, [poolPositions, midPrice]);

  const positionNotional = useMemo(() => {
    if (midPrice === null) {
      return null;
    }
    return poolPositions.reduce((accumulator, position) => {
      const amountBase = toNumber(position.amountBase) ?? 0;
      const amountQuote = toNumber(position.amountQuote) ?? 0;
      return accumulator + amountQuote + amountBase * midPrice;
    }, 0);
  }, [poolPositions, midPrice]);

  const simplePnl = useMemo(() => {
    if (midPrice === null || positionNotional === null) {
      return null;
    }
    return totalFeesQuote;
  }, [midPrice, positionNotional, totalFeesQuote]);

  const handlePoolChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedPool(event.target.value);
  };

  const handleCsvUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    setCsvLoading(true);
    const toastId = toast.loading('Parsing CSV file...');

    Papa.parse<CsvRow>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CsvRow>) => {
        setCsvLoading(false);
        
        if (results.errors.length > 0) {
          const parseError = results.errors[0];
          const message = parseError?.message ?? "Unknown parse error";
          toast.error(`Malformed CSV: ${message}`, { id: toastId });
          setBacktestRows([]);
          setCsvName("");
          return;
        }

        const fields = results.meta.fields ?? [];
        const missingHeaders = REQUIRED_HEADERS.filter((header) => !fields.includes(header));
        if (missingHeaders.length > 0) {
          toast.error(`Malformed CSV: missing columns ${missingHeaders.join(", ")}`, { id: toastId });
          setBacktestRows([]);
          setCsvName("");
          return;
        }

        const parsed: CandleRow[] = [];
        for (let index = 0; index < results.data.length; index += 1) {
          const row = results.data[index];
          if (!row) {
            toast.error(`Malformed CSV: empty row encountered (row ${index + 2})`, { id: toastId });
            setBacktestRows([]);
            setCsvName("");
            return;
          }
          const ts = toNumber(row.timestamp);
          const open = toNumber(row.open);
          const high = toNumber(row.high);
          const low = toNumber(row.low);
          const close = toNumber(row.close);

          if (
            ts === null ||
            open === null ||
            high === null ||
            low === null ||
            close === null
          ) {
            toast.error(`Malformed CSV: numeric values required (row ${index + 2})`, { id: toastId });
            setBacktestRows([]);
            setCsvName("");
            return;
          }

          parsed.push({
            t: toMillis(ts),
            o: open,
            h: high,
            l: low,
            c: close,
          });
        }

        if (parsed.length === 0) {
          toast.error("Malformed CSV: no valid rows found.", { id: toastId });
          setBacktestRows([]);
          setCsvName("");
          return;
        }

        setCsvName(file.name);
        setBacktestRows(parsed);
        toast.success(`Successfully loaded ${parsed.length} candles from ${file.name}`, { id: toastId });
      },
      error: (error) => {
        setCsvLoading(false);
        const message = error instanceof Error ? error.message : "Unknown parse error";
        toast.error(`Malformed CSV: ${message}`, { id: toastId });
        setBacktestRows([]);
        setCsvName("");
      },
    });

    event.target.value = "";
  };

  // Animation variants
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1] as const
      }
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
      padding: '2rem 0'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 1.5rem'
      }} className="space-y-6">
        {/* Page Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1e3f 0%, #2a2a5c  100%)',
          border: '1px solid #3a3a6b',
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          backdropFilter: 'blur(10px)',
          marginBottom: '2rem'
        }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Analyze current metrics and backtest trading strategies with historical data.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        </div>

        {/* Two-Card Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          
          {/* Card 1: Current Metrics */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            style={{
              background: 'linear-gradient(135deg, #1e1e3f 0%, #2a2a5c  100%)',
              border: '1px solid #3a3a6b',
              borderRadius: '1rem',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white'
            }}
            className="rounded-lg border bg-card shadow-sm"
          >
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium">Current Metrics</h2>
              <p className="text-sm text-muted-foreground">Live position data and performance</p>
            </div>

            {/* Pool Selector */}
            <div className="space-y-2">
              <label htmlFor="pool-select" className="text-sm font-medium text-white">
                Trading Pool
              </label>
              {poolsLoading ? (
                <div style={{
                  background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                  borderRadius: '0.5rem'
                }} className="h-10 animate-pulse" />
              ) : (
                <select
                  id="pool-select"
                  value={selectedPool}
                  onChange={handlePoolChange}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #5a5a8b',
                    color: 'white'
                  }}
                  className="flex h-10 w-full rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="" disabled style={{ background: '#1e1e3f', color: 'white' }}>Select a pool</option>
                  {poolOptions.map((option) => (
                    <option key={option.value} value={option.value} style={{ background: '#1e1e3f', color: 'white' }}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {poolsError && <p className="text-sm text-red-400">{poolsError}</p>}
            </div>

            {/* Stats Row 1: Mid Price & Positions */}
            <div className="grid grid-cols-2 gap-4">
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1.5rem'
              }} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-300">Mid Price</p>
                <p className="text-lg font-semibold text-white">
                  {midPriceLoading ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : midPrice !== null ? (
                    midPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })
                  ) : (
                    <span className="text-gray-400">Unavailable</span>
                  )}
                </p>
              </div>
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1.5rem'
              }} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-300">Positions</p>
                <p className="text-lg font-semibold text-white">
                  {positionsLoading ? (
                    <span className="text-gray-400">Loading...</span>
                  ) : connected ? (
                    poolPositions.length
                  ) : (
                    <span className="text-gray-400">Connect wallet</span>
                  )}
                </p>
              </div>
            </div>

            {/* Active Band Block */}
            {activeBand && (
              <div style={{
                background: 'linear-gradient(135deg, #1e3a1e 0%, #2a5c2a 100%)',
                border: '1px solid #3a7b3a',
                borderRadius: '0.75rem',
                padding: '1.5rem'
              }}>
                <p className="text-xs font-medium uppercase tracking-wide text-green-300 mb-2">Active Band</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-white">{activeBand.lower.toLocaleString()}</span>
                  <span className="text-green-400">→</span>
                  <span className="font-mono text-white">{activeBand.upper.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Stats Row 2: Fees & PnL */}
            <div className="grid grid-cols-2 gap-4">
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1.5rem'
              }} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-300">Fees Est.</p>
                <p className="text-lg font-semibold text-white">
                  {totalFeesQuote > 0 ? totalFeesQuote.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                </p>
              </div>
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1.5rem'
              }} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-300">Simple PnL</p>
                <p className="text-lg font-semibold text-white">
                  {simplePnl !== null ? simplePnl.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "–"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

          {/* Card 2: Backtest What-If */}
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            style={{
              background: 'linear-gradient(135deg, #1e1e3f 0%, #2a2a5c  100%)',
              border: '1px solid #3a3a6b',
              borderRadius: '1rem',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white'
            }}
            className="rounded-lg border bg-card shadow-sm"
          >
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium">Backtest What-If</h2>
              <p className="text-sm text-muted-foreground">
                {csvName ? `Loaded: ${csvName}` : "Upload historical data to simulate strategies"}
              </p>
            </div>

            {/* Three Inline Inputs */}
            <div style={{
              background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
              border: '1px solid #4a4a7b',
              borderRadius: '0.75rem',
              padding: '1.5rem'
            }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label htmlFor="band-input" className="text-xs font-medium uppercase tracking-wide text-gray-300">
                    Band (bps)
                  </label>
                  <input
                    id="band-input"
                    type="number"
                    min={1}
                    value={bandBps}
                    onChange={(event) => setBandBps(Math.max(1, Number(event.target.value) || 1))}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid #5a5a8b',
                      color: 'white'
                    }}
                    className="flex h-9 w-full rounded-md px-3 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="cooldown-input" className="text-xs font-medium uppercase tracking-wide text-gray-300">
                    Cooldown (sec)
                  </label>
                  <input
                    id="cooldown-input"
                    type="number"
                    min={1}
                    value={cooldownSec}
                    onChange={(event) => setCooldownSec(Math.max(1, Number(event.target.value) || 1))}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid #5a5a8b',
                      color: 'white'
                    }}
                    className="flex h-9 w-full rounded-md px-3 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="csv-upload" className="text-xs font-medium uppercase tracking-wide text-gray-300">
                    CSV Upload
                  </label>
                  <div>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCsvUpload}
                      disabled={csvLoading}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label
                      htmlFor="csv-upload"
                      style={{
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        border: '1px solid #2563eb',
                        color: 'white',
                        cursor: csvLoading ? 'not-allowed' : 'pointer'
                      }}
                      className="flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 py-1 text-sm hover:opacity-90 transition-opacity"
                    >
                      <Upload className="w-3 h-3" />
                      {csvLoading ? 'Processing...' : 'Choose File'}
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart Area - Fixed Height 300px */}
            <div>
              {csvLoading ? (
                <div style={{
                  background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                  border: '1px solid #4a4a7b',
                  borderRadius: '0.75rem'
                }} className="h-[300px] animate-pulse flex items-center justify-center">
                  <span className="text-sm text-gray-300">Processing CSV...</span>
                </div>
              ) : backtestResult ? (
                <div style={{
                  background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                  border: '1px solid #4a4a7b',
                  borderRadius: '0.75rem',
                  padding: '1rem'
                }} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={backtestResult.equitySeries}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="t"
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                        className="text-xs"
                        tick={{ fill: 'white' }}
                      />
                      <YAxis 
                        domain={["auto", "auto"]}
                        className="text-xs"
                        tick={{ fill: 'white' }}
                      />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleString()}
                        contentStyle={{ 
                          backgroundColor: '#1e1e3f', 
                          border: '1px solid #3a3a6b',
                          borderRadius: '8px',
                          color: 'white'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="equity" 
                        stroke="#10b981" 
                        dot={false} 
                        strokeWidth={3}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{
                  background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                  border: '2px dashed #4a4a7b',
                  borderRadius: '0.75rem'
                }} className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-300">
                      Upload CSV with: timestamp, open, high, low, close
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* One-Line Summary */}
            {backtestResult && (
              <div style={{
                background: 'linear-gradient(135deg, #1e3a1e 0%, #2a5c2a 100%)',
                border: '1px solid #3a7b3a',
                borderRadius: '0.75rem',
                padding: '1rem',
                textAlign: 'center'
              }}>
                <div className="text-sm text-green-300">
                  <strong className="text-white">{backtestResult.exits}</strong> exits · 
                  <strong className="text-white"> {backtestResult.totalFeesPct}%</strong> total fees · 
                  <strong className="text-white"> {backtestResult.finalEquity.toFixed(4)}</strong> final equity
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
      </div>
    </div>
  );
}
