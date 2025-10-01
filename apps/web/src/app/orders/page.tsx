"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  listPools,
  planAdvanced,
  armAdvanced,
  disarmAdvanced,
  type PoolRef,
  type AdvKind,
} from '@dlmm-copilot/core';
import { 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  ChevronLeft,
  Target,
  Coins,
  Info,
  Play,
  Square,
  Eye,
  CheckCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { 
  PageHeader, 
  SectionCard, 
  FormRow, 
  SkeletonRow 
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TooltipProvider
} from '@/components/ui/tooltip';

type OrderTabKind = 'limitBuy' | 'limitSell' | 'stopLoss';

const ORDER_TYPES: { 
  value: OrderTabKind; 
  label: string; 
  icon: React.ReactNode; 
  description: string 
}[] = [
  { 
    value: 'limitBuy', 
    label: 'Limit Buy', 
    icon: <TrendingUp className="w-4 h-4" />, 
    description: 'Buy when price drops to target' 
  },
  { 
    value: 'limitSell', 
    label: 'Limit Sell', 
    icon: <TrendingDown className="w-4 h-4" />, 
    description: 'Sell when price rises to target' 
  },
  { 
    value: 'stopLoss', 
    label: 'Stop Loss', 
    icon: <ShieldAlert className="w-4 h-4" />, 
    description: 'Sell when price drops below target' 
  },
];

type AsyncState = 'idle' | 'loading' | 'ready' | 'error';

export default function OrdersPage(): JSX.Element {
  const { connected, publicKey } = useWallet();
  const [pools, setPools] = useState<PoolRef[]>([]);
  const [poolsStatus, setPoolsStatus] = useState<AsyncState>('idle');
  const [pool, setPool] = useState<string>('');
  const [kind, setKind] = useState<OrderTabKind>('limitBuy');
  const [targetPrice, setTargetPrice] = useState<number>(1.0);
  const [sizeBase, setSizeBase] = useState<string>('');
  const [sizeQuote, setSizeQuote] = useState<string>('');

  const [bins, setBins] = useState<number[]>([]);
  const [singleSided, setSingleSided] = useState<'base' | 'quote' | ''>('');
  const [note, setNote] = useState<string>('');
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [isArming, setIsArming] = useState<boolean>(false);
  const [isDisarming, setIsDisarming] = useState<boolean>(false);
  const [showPlanResult, setShowPlanResult] = useState<boolean>(false);

  const walletAddress = publicKey?.toBase58() ?? '';

  useEffect(() => {
    if (kind === 'limitSell' || kind === 'stopLoss') {
      setSizeQuote('');
    } else {
      setSizeBase('');
    }
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    setPoolsStatus('loading');
    
    void (async () => {
      try {
        const result = await listPools();
        if (cancelled) return;
        
        if (result.ok) {
          setPools(result.value);
          setPool((previous) => previous || (result.value[0]?.address ?? ''));
          setPoolsStatus('ready');
        } else {
          setPoolsStatus('error');
          toast.error(result.detail ?? result.error ?? 'Unable to load pools');
        }
      } catch (error) {
        if (cancelled) return;
        setPoolsStatus('error');
        toast.error('Failed to load pools');
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, []);

  const buildSpec = () => ({
    kind: kind as AdvKind,
    targetPrice,
    ...(sizeBase ? { sizeBase } : {}),
    ...(sizeQuote ? { sizeQuote } : {}),
  });

  const handlePlan = async () => {
    if (!connected || !walletAddress || !pool) {
      toast.error('Connect your wallet and choose a pool before planning.');
      return;
    }
    if (targetPrice <= 0) {
      toast.error('Target price must be positive.');
      return;
    }

    setIsPlanning(true);
    setShowPlanResult(false);
    
    const toastId = toast.loading('Calculating order plan...');
    
    try {
      const result = await planAdvanced({ 
        wallet: walletAddress, 
        pool, 
        spec: buildSpec() 
      });
      
      if (!result.ok) {
        toast.error(result.problem.detail ?? result.problem.title, { id: toastId });
        return;
      }
      
      setBins(result.value.bins);
      setSingleSided(result.value.singleSided);
      setNote(result.value.note);
      setShowPlanResult(true);
      
      toast.success(`Plan calculated! ${result.value.bins.length} bins identified.`, { 
        id: toastId 
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to plan advanced order.';
      toast.error(message, { id: toastId });
    } finally {
      setIsPlanning(false);
    }
  };

  const ensureAmounts = (): boolean => {
    if (kind === 'limitSell' || kind === 'stopLoss') {
      if (!sizeBase || Number(sizeBase) <= 0) {
        toast.error('Enter a positive base size for this order.');
        return false;
      }
    } else if (kind === 'limitBuy') {
      if (!sizeQuote || Number(sizeQuote) <= 0) {
        toast.error('Enter a positive quote size for this order.');
        return false;
      }
    }
    return true;
  };

  const handleArm = async () => {
    if (!connected || !walletAddress || !pool) {
      toast.error('Connect your wallet and choose a pool before arming.');
      return;
    }
    if (targetPrice <= 0) {
      toast.error('Target price must be positive.');
      return;
    }
    if (!ensureAmounts()) {
      return;
    }

    setIsArming(true);
    const toastId = toast.loading(`Arming ${kind} order...`);
    
    try {
      const result = await armAdvanced({ 
        wallet: walletAddress, 
        pool, 
        spec: buildSpec() 
      });
      
      if (!result.ok) {
        toast.error(result.problem.detail ?? result.problem.title, { id: toastId });
        return;
      }
      
      const { txid } = result.value;
      const isSimulated = txid.startsWith('MOCK-');
      const orderLabel = ORDER_TYPES.find(t => t.value === kind)?.label || kind;
      
      toast.success(
        isSimulated 
          ? `${orderLabel} order simulated successfully!`
          : `${orderLabel} order armed successfully!`,
        { 
          id: toastId,
          duration: 5000
        }
      );
      
      // Reset form after successful arming
      setSizeBase('');
      setSizeQuote('');
      setBins([]);
      setShowPlanResult(false);
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to arm advanced order.';
      toast.error(message, { id: toastId });
    } finally {
      setIsArming(false);
    }
  };

  const handleDisarm = async () => {
    if (!connected || !walletAddress || !pool) {
      toast.error('Connect your wallet and choose a pool before disarming.');
      return;
    }

    setIsDisarming(true);
    const toastId = toast.loading('Disarming order...');
    
    try {
      const result = await disarmAdvanced({ wallet: walletAddress, pool });
      
      if (!result.ok) {
        toast.error(result.problem.detail ?? result.problem.title, { id: toastId });
        return;
      }
      
      const { txid } = result.value;
      const isSimulated = txid.startsWith('MOCK-');
      
      toast.success(
        isSimulated 
          ? 'Order disarmed successfully (simulated)'
          : 'Order disarmed successfully!',
        { 
          id: toastId,
          duration: 3000
        }
      );
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to disarm advanced order.';
      toast.error(message, { id: toastId });
    } finally {
      setIsDisarming(false);
    }
  };

  const selectedPool = pools.find(p => p.address === pool);
  const selectedOrderType = ORDER_TYPES.find(t => t.value === kind);

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
      <TooltipProvider>
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 1.5rem'
          }}
          className="space-y-6"
        >
        <motion.div variants={itemVariants}>
          <div style={{
            background: 'linear-gradient(135deg, #1e1e3f 0%, #2a2a5c  100%)',
            border: '1px solid #3a3a6b',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)',
            marginBottom: '2rem'
          }}>
            <PageHeader 
              title="Advanced Orders"
              description="Create smart orders that execute automatically when price conditions are met. Use DLMM bins for precise control over your trading strategy."
              actions={
                <Link href="/">
                  <Button variant="outline">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </Link>
              }
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <div style={{
            background: 'linear-gradient(135deg, #1e1e3f 0%, #2a2a5c  100%)',
            border: '1px solid #3a3a6b',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)',
            color: 'white'
          }}>
            <SectionCard
              title="Order Configuration"
              description="Set up your automated trading order"
            >
            <Tabs 
              value={kind} 
              onValueChange={(value) => setKind(value as OrderTabKind)} 
              className="w-full"
            >
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '2rem'
              }}>
                <TabsList className="grid w-full grid-cols-3 mb-0" style={{
                  background: 'transparent',
                  border: 'none'
                }}>
                {ORDER_TYPES.map((orderType) => (
                  <TabsTrigger 
                    key={orderType.value} 
                    value={orderType.value} 
                    className="flex items-center gap-2"
                  >
                    {orderType.icon}
                    <span className="hidden sm:inline">{orderType.label}</span>
                    <span className="sm:hidden">
                      {orderType.value === 'limitBuy' ? 'Buy' : 
                       orderType.value === 'limitSell' ? 'Sell' : 'Stop'}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              </div>

              {/* Pool Selection Section */}
              <div className="space-y-4 mb-6">
                <FormRow
                  label="Trading Pool"
                  required
                  tooltip="Select the liquidity pool for your order"
                  error={pool ? undefined : 'Please select a pool'}
                >
                  {poolsStatus === 'loading' ? (
                    <SkeletonRow />
                  ) : (
                    <select
                      value={pool}
                      onChange={(event) => setPool(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="" disabled>
                        Select a pool
                      </option>
                      {pools.map((p) => (
                        <option key={p.address} value={p.address}>
                          {p.tokenA} / {p.tokenB} • {p.address.slice(0, 8)}...
                        </option>
                      ))}
                    </select>
                  )}
                </FormRow>

                {selectedPool && (
                  <div className="p-4 rounded-lg border bg-muted/50">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      Pool Information
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Base Token:</span>
                        <div className="font-medium">{selectedPool.tokenA}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Quote Token:</span>
                        <div className="font-medium">{selectedPool.tokenB}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {ORDER_TYPES.map((orderType) => (
                <TabsContent 
                  key={orderType.value} 
                  value={orderType.value} 
                  className="space-y-4 mt-0"
                >
                  <div style={{
                    background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                    border: '1px solid #4a4a7b',
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                    marginTop: '1rem'
                  }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${
                      orderType.value === 'limitBuy' ? 'bg-green-100 dark:bg-green-900/30' :
                      orderType.value === 'limitSell' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      {orderType.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold">{orderType.label}</h3>
                      <p className="text-sm text-muted-foreground">{orderType.description}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormRow
                      label="Target Price"
                      required
                      tooltip={`Price at which the ${orderType.label.toLowerCase()} order will be triggered`}
                      error={targetPrice <= 0 ? 'Price must be greater than 0' : undefined}
                    >
                      <div className="relative">
                        <Target className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={targetPrice}
                          onChange={(event) => setTargetPrice(Number(event.target.value) || 0)}
                          placeholder="0.00"
                          className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    </FormRow>

                    {(orderType.value === 'limitSell' || orderType.value === 'stopLoss') && (
                      <FormRow
                        label={`Amount (${selectedPool?.tokenA || 'Base Token'})`}
                        required
                        tooltip="Amount of base token to sell"
                        error={!sizeBase || Number(sizeBase) <= 0 ? 'Enter a valid amount' : undefined}
                      >
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={sizeBase}
                          onChange={(event) => setSizeBase(event.target.value)}
                          placeholder="0.00"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </FormRow>
                    )}

                    {orderType.value === 'limitBuy' && (
                      <FormRow
                        label={`Amount (${selectedPool?.tokenB || 'Quote Token'})`}
                        required
                        tooltip="Amount of quote token to spend"
                        error={!sizeQuote || Number(sizeQuote) <= 0 ? 'Enter a valid amount' : undefined}
                      >
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={sizeQuote}
                          onChange={(event) => setSizeQuote(event.target.value)}
                          placeholder="0.00"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </FormRow>
                    )}
                  </div>

                  {/* Educational Info */}
                  <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-blue-600 dark:text-blue-400">
                        <p className="font-medium mb-1">How {orderType.label} Works</p>
                        <p>
                          {orderType.value === 'limitBuy' && 'Places liquidity below current price. When price drops to your target, the order buys tokens automatically.'}
                          {orderType.value === 'limitSell' && 'Places liquidity above current price. When price rises to your target, the order sells tokens automatically.'}
                          {orderType.value === 'stopLoss' && 'Places liquidity below current price as a safety net. If price drops to your target, tokens are automatically sold to limit losses.'}
                        </p>
                      </div>
                    </div>
                  </div>
                  </div>
                </TabsContent>
              ))}

              {/* Action Buttons */}
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginTop: '1.5rem'
              }}>
                <h4 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: 'white',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  Order Actions
                </h4>
                <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  type="button"
                  onClick={() => void handlePlan()}
                  disabled={!connected || !pool || isPlanning || targetPrice <= 0}
                  variant="outline"
                  className="flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    border: '1px solid #2563eb',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Eye className="w-4 h-4" />
                  {isPlanning ? 'Planning...' : 'Preview Plan'}
                </Button>
                
                <Button
                  type="button"
                  onClick={() => void handleArm()}
                  disabled={!connected || !pool || isArming || targetPrice <= 0 || !ensureAmounts()}
                  className="flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                    border: '1px solid #059669',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Play className="w-4 h-4" />
                  {isArming ? 'Arming...' : `Arm ${selectedOrderType?.label || 'Order'}`}
                </Button>
                
                <Button
                  type="button"
                  onClick={() => void handleDisarm()}
                  disabled={!connected || !pool || isDisarming}
                  variant="outline"
                  className="flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    border: '1px solid #e11d48',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Square className="w-4 h-4" />
                  {isDisarming ? 'Disarming...' : 'Disarm Order'}
                </Button>
                </div>
              </div>

              {!connected && (
                <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Wallet Required</span>
                  </div>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    Connect your wallet to preview and manage advanced orders.
                  </p>
                </div>
              )}
            </Tabs>
          </SectionCard>
          </div>
        </motion.div>

        {/* Plan Results with Animation */}
        <AnimatePresence>
          {showPlanResult && bins.length > 0 && (
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="space-y-4"
            >
              <div style={{
                background: 'linear-gradient(135deg, #1e3a1e 0%, #2a5c2a  100%)',
                border: '1px solid #3a7b3a',
                borderRadius: '1rem',
                padding: '2rem',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(10px)',
                color: 'white'
              }}>
                <SectionCard
                  title="Order Plan Preview"
                  description="Review the calculated bin positions for your order"
                  className="border-green-200 dark:border-green-800"
                >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <CheckCircle className="w-4 h-4" />
                        Order Type
                      </div>
                      <div className="font-medium">{selectedOrderType?.label}</div>
                    </div>
                    
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Target className="w-4 h-4" />
                        Target Price
                      </div>
                      <div className="font-mono font-medium">{targetPrice}</div>
                    </div>
                    
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Coins className="w-4 h-4" />
                        Single-Sided
                      </div>
                      <div className="font-medium capitalize">{singleSided}</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1 rounded bg-blue-100 dark:bg-blue-900/30">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h4 className="font-medium">Planned Bins ({bins.length})</h4>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {bins.map((bin, index) => (
                        <motion.div
                          key={bin}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ 
                            opacity: 1, 
                            scale: 1,
                            transition: { delay: index * 0.05, duration: 0.2 }
                          }}
                        >
                          <Badge 
                            variant="secondary" 
                            className="font-mono text-xs px-2 py-1"
                          >
                            Bin {bin}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {note && (
                    <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-600 dark:text-blue-400">
                          <p className="font-medium mb-1">Strategy Note</p>
                          <p>{note}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </TooltipProvider>
    </div>
  );
}
