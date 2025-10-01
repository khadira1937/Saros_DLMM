"use client";

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  addLiquidity,
  currentMidPrice,
  listPools,
  priceToBinIndex,
  type PoolRef,
} from '@dlmm-copilot/core';
import { 
  ArrowRight, 
  ChevronLeft, 
  CheckCircle, 
  Settings, 
  Coins,
  TrendingUp,
  AlertTriangle,
  Info
} from 'lucide-react';
import { 
  PageHeader, 
  SectionCard, 
  FormRow, 
  SkeletonRow 
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  TooltipProvider
} from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

const formSchema = z
  .object({
    pool: z.string().min(1, 'Select a pool'),
    bandBps: z.coerce.number().int().min(1).max(10_000),
    mode: z.enum(['base', 'quote', 'both']),
    amountBase: z.string().optional(),
    amountQuote: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== 'quote' && (!value.amountBase || Number(value.amountBase) <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountBase'],
        message: 'Enter a positive base amount',
      });
    }

    if (value.mode !== 'base' && (!value.amountQuote || Number(value.amountQuote) <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountQuote'],
        message: 'Enter a positive quote amount',
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

type BandInfo = {
  midPrice: number;
  binLower: number;
  binUpper: number;
  currentBin: number;
};

type AsyncState = 'idle' | 'loading' | 'ready' | 'error';

type WizardStep = '1' | '2' | '3' | 'review';

export default function NewPositionPage(): JSX.Element {
  const { publicKey, connected } = useWallet();
  const [pools, setPools] = useState<PoolRef[]>([]);
  const [poolStatus, setPoolStatus] = useState<AsyncState>('idle');
  const [poolError, setPoolError] = useState<string | null>(null);

  const [bandInfo, setBandInfo] = useState<BandInfo | null>(null);
  const [bandStatus, setBandStatus] = useState<AsyncState>('idle');
  const [bandError, setBandError] = useState<string | null>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>('1');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pool: '',
      bandBps: 100,
      mode: 'both',
      amountBase: '',
      amountQuote: '',
    },
  });

  const poolValue = watch('pool');
  const bandBps = watch('bandBps');
  const modeValue = watch('mode');

  useEffect(() => {
    let mounted = true;
    setPoolStatus('loading');
    setPoolError(null);

    void listPools()
      .then((result) => {
        if (!mounted) return;
        if (result.ok) {
          setPools(result.value);
          setPoolStatus('ready');
          const currentPool = getValues('pool');
          if (!currentPool && result.value.length > 0) {
            setValue('pool', result.value[0]?.address ?? '', { shouldDirty: false, shouldTouch: false });
          }
        } else {
          setPoolStatus('error');
          setPoolError(result.detail ?? `Unable to load pools (${result.error})`);
        }
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setPoolStatus('error');
        setPoolError(error instanceof Error ? error.message : 'Failed to load pools');
      });

    return () => {
      mounted = false;
    };
  }, [setValue, getValues]);

  useEffect(() => {
    const bandValue = Number(bandBps);
    if (!poolValue || !Number.isFinite(bandValue)) {
      setBandInfo(null);
      setBandStatus('idle');
      setBandError(null);
      return;
    }

    let cancelled = false;
    setBandStatus('loading');
    setBandError(null);

    const fetchBand = async () => {
      const midPriceResult = await currentMidPrice(poolValue);
      if (!midPriceResult.ok) {
        if (!cancelled) {
          setBandStatus('error');
          setBandError(midPriceResult.detail ?? `Unable to fetch mid price (${midPriceResult.error})`);
        }
        return;
      }

      const midPrice = midPriceResult.value;
      const ratio = bandValue / 10_000;
      const lowerPrice = midPrice * (1 - ratio);
      const upperPrice = midPrice * (1 + ratio);

      const currentResult = await priceToBinIndex(poolValue, midPrice);
      if (!currentResult.ok) {
        if (!cancelled) {
          setBandStatus('error');
          setBandError(currentResult.detail ?? `Unable to fetch current bin (${currentResult.error})`);
        }
        return;
      }

      const lowerResult = await priceToBinIndex(poolValue, lowerPrice);
      if (!lowerResult.ok) {
        if (!cancelled) {
          setBandStatus('error');
          setBandError(lowerResult.detail ?? `Unable to compute lower bin (${lowerResult.error})`);
        }
        return;
      }

      const upperResult = await priceToBinIndex(poolValue, upperPrice);
      if (!upperResult.ok) {
        if (!cancelled) {
          setBandStatus('error');
          setBandError(upperResult.detail ?? `Unable to compute upper bin (${upperResult.error})`);
        }
        return;
      }

      if (!cancelled) {
        setBandInfo({
          midPrice,
          currentBin: currentResult.value,
          binLower: Math.min(lowerResult.value, upperResult.value),
          binUpper: Math.max(lowerResult.value, upperResult.value),
        });
        setBandStatus('ready');
      }
    };

    void fetchBand();

    return () => {
      cancelled = true;
    };
  }, [poolValue, bandBps]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!connected || !publicKey) {
        toast.error('Connect your wallet before creating a position.');
        return;
      }

      if (!bandInfo) {
        toast.error('Band information is still loading. Please wait a moment.');
        return;
      }

      const payload: Parameters<typeof addLiquidity>[0] = {
        pool: values.pool,
        binLower: bandInfo.binLower,
        binUpper: bandInfo.binUpper,
        singleSided: values.mode,
      };

      if (values.mode !== 'quote' && values.amountBase) {
        payload.amountBase = values.amountBase;
      }

      if (values.mode !== 'base' && values.amountQuote) {
        payload.amountQuote = values.amountQuote;
      }

      const toastId = toast.loading('Submitting liquidity…');
      try {
        const result = await addLiquidity(payload);
        if (result.ok) {
          const { txid } = result.value;
          const simulated = txid.startsWith('MOCK-');
          toast.success(
            simulated
              ? `Simulated liquidity add completed. Tx: ${txid}`
              : `Liquidity added successfully. Tx: ${txid}`,
            { id: toastId },
          );
        } else {
          toast.error(result.detail ?? `Failed to add liquidity (${result.error})`, { id: toastId });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unexpected error while adding liquidity.';
        toast.error(message, { id: toastId });
      }
    },
    [bandInfo, connected, publicKey],
  );

  const canProceedToStep2 = poolValue && poolStatus === 'ready';
  const canProceedToStep3 = canProceedToStep2 && bandStatus === 'ready' && bandInfo;
  const canProceedToReview = canProceedToStep3 && (
    (modeValue === 'both' && watch('amountBase') && watch('amountQuote')) ||
    (modeValue === 'base' && watch('amountBase')) ||
    (modeValue === 'quote' && watch('amountQuote'))
  );

  const handleNext = () => {
    if (currentStep === '1' && canProceedToStep2) setCurrentStep('2');
    else if (currentStep === '2' && canProceedToStep3) setCurrentStep('3');
    else if (currentStep === '3' && canProceedToReview) setCurrentStep('review');
  };

  const handleBack = () => {
    if (currentStep === 'review') setCurrentStep('3');
    else if (currentStep === '3') setCurrentStep('2');
    else if (currentStep === '2') setCurrentStep('1');
  };

  const selectedPool = pools.find(p => p.address === poolValue);

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
              title="Create Position Wizard"
              description="Set up your liquidity position in 3 simple steps: select a pool, configure your strategy, and deposit tokens."
              actions={
                <Link href="/positions">
                  <Button variant="outline">
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back to Positions
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
              title="Position Setup"
              description="Configure your liquidity position step by step"
            >
            <Tabs value={currentStep} onValueChange={(value) => setCurrentStep(value as WizardStep)} className="w-full">
              <div style={{
                background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                border: '1px solid #4a4a7b',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '2rem'
              }}>
                <TabsList className="grid w-full grid-cols-4 mb-0" style={{
                  background: 'transparent',
                  border: 'none'
                }}>
                <TabsTrigger value="1" className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs">
                    1
                  </div>
                  Pool
                </TabsTrigger>
                <TabsTrigger value="2" disabled={!canProceedToStep2} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs">
                    2
                  </div>
                  Strategy
                </TabsTrigger>
                <TabsTrigger value="3" disabled={!canProceedToStep3} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs">
                    3
                  </div>
                  Amounts
                </TabsTrigger>
                <TabsTrigger value="review" disabled={!canProceedToReview} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Review
                </TabsTrigger>
              </TabsList>
              </div>

              <form onSubmit={handleSubmit(() => setShowConfirmDialog(true))} className="space-y-6">
                {/* Step 1: Pool Selection */}
                <TabsContent value="1" className="space-y-4 mt-0">
                  <div style={{
                    background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                    border: '1px solid #4a4a7b',
                    borderRadius: '0.75rem',
                    padding: '1.5rem'
                  }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Coins className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Select Liquidity Pool</h3>
                      <p className="text-sm text-muted-foreground">Choose the trading pair for your position</p>
                    </div>
                  </div>

                  {poolStatus === 'loading' ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <SkeletonRow key={i} />
                      ))}
                    </div>
                  ) : (
                    <FormRow
                      label="Trading Pool"
                      required
                      tooltip="Select the liquidity pool where you want to provide liquidity"
                      error={errors.pool?.message}
                    >
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        {...register('pool')}
                        disabled={poolStatus !== 'ready'}
                      >
                        <option value="" disabled>
                          {poolStatus !== 'ready' ? 'Loading pools…' : 'Select a pool'}
                        </option>
                        {pools.map((pool) => (
                          <option key={pool.address} value={pool.address}>
                            {pool.tokenA} / {pool.tokenB} • {pool.address.slice(0, 8)}...
                          </option>
                        ))}
                      </select>
                    </FormRow>
                  )}

                  {poolStatus === 'error' && (
                    <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">Failed to load pools</span>
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                        {poolError ?? 'Unable to load available pools. Please try again.'}
                      </p>
                    </div>
                  )}

                  {selectedPool && (
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <h4 className="font-medium mb-2">Pool Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Token A:</span>
                          <span>{selectedPool.tokenA}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Token B:</span>
                          <span>{selectedPool.tokenB}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Decimals:</span>
                          <span>{selectedPool.decimalsA} / {selectedPool.decimalsB}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button 
                      type="button" 
                      onClick={handleNext}
                      disabled={!canProceedToStep2}
                      className="flex items-center gap-2"
                    >
                      Next: Configure Strategy
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </TabsContent>

                {/* Step 2: Strategy Configuration */}
                <TabsContent value="2" className="space-y-4 mt-0">
                  <div style={{
                    background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                    border: '1px solid #4a4a7b',
                    borderRadius: '0.75rem',
                    padding: '1.5rem'
                  }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                      <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Configure Strategy</h3>
                      <p className="text-sm text-muted-foreground">Set your price range and band width</p>
                    </div>
                  </div>

                  <FormRow
                    label="Band Width (Basis Points)"
                    required
                    tooltip="The percentage range around the current price where your liquidity will be active. 100 bps = 1%"
                    error={errors.bandBps?.message}
                  >
                    <input
                      type="number"
                      min={1}
                      max={10_000}
                      step={1}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="e.g. 100"
                      {...register('bandBps')}
                    />
                  </FormRow>

                  {/* Band Information Display */}
                  <div className="p-4 rounded-lg border bg-muted/50">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <h4 className="font-medium">Price Range Calculation</h4>
                    </div>
                    
                    {bandStatus === 'idle' && (
                      <p className="text-sm text-muted-foreground">
                        Configure the band width to see your price range calculation.
                      </p>
                    )}
                    
                    {bandStatus === 'loading' && (
                      <div className="space-y-2">
                        <SkeletonRow />
                        <SkeletonRow />
                      </div>
                    )}
                    
                    {bandStatus === 'error' && (
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">{bandError ?? 'Unable to calculate price range.'}</span>
                      </div>
                    )}
                    
                    {bandStatus === 'ready' && bandInfo && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <div className="text-muted-foreground">Current Price</div>
                            <div className="font-mono font-medium">{bandInfo.midPrice.toFixed(6)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">Current Bin</div>
                            <div className="font-mono font-medium">{bandInfo.currentBin}</div>
                          </div>
                        </div>
                        
                        <div className="p-3 rounded border bg-background">
                          <div className="text-sm text-muted-foreground mb-1">Target Range</div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{bandInfo.binLower}</span>
                            <div className="flex-1 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded"></div>
                            <span className="font-mono text-sm">{bandInfo.binUpper}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Bin Range: {bandInfo.binUpper - bandInfo.binLower} bins
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between">
                    <Button type="button" onClick={handleBack} variant="outline" className="flex items-center gap-2">
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button 
                      type="button" 
                      onClick={handleNext}
                      disabled={!canProceedToStep3}
                      className="flex items-center gap-2"
                    >
                      Next: Set Amounts
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </TabsContent>

                {/* Step 3: Amount Configuration */}
                <TabsContent value="3" className="space-y-4 mt-0">
                  <div style={{
                    background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                    border: '1px solid #4a4a7b',
                    borderRadius: '0.75rem',
                    padding: '1.5rem'
                  }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <Coins className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Set Token Amounts</h3>
                      <p className="text-sm text-muted-foreground">Choose deposit mode and amounts</p>
                    </div>
                  </div>

                  <FormRow
                    label="Deposit Mode"
                    required
                    tooltip="Choose whether to deposit both tokens, or just one token"
                    error={errors.mode?.message}
                  >
                    <div className="grid grid-cols-3 gap-2">
                      <Label className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                        <input type="radio" value="both" {...register('mode')} />
                        <span className="text-sm">Both Tokens</span>
                      </Label>
                      <Label className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                        <input type="radio" value="base" {...register('mode')} />
                        <span className="text-sm">Base Only</span>
                      </Label>
                      <Label className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                        <input type="radio" value="quote" {...register('mode')} />
                        <span className="text-sm">Quote Only</span>
                      </Label>
                    </div>
                  </FormRow>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormRow
                      label={`Base Amount (${selectedPool?.tokenA || 'Token A'})`}
                      required={modeValue !== 'quote'}
                      tooltip="Amount of base token to deposit"
                      error={errors.amountBase?.message}
                    >
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={modeValue === 'quote'}
                        {...register('amountBase')}
                      />
                    </FormRow>

                    <FormRow
                      label={`Quote Amount (${selectedPool?.tokenB || 'Token B'})`}
                      required={modeValue !== 'base'}
                      tooltip="Amount of quote token to deposit"
                      error={errors.amountQuote?.message}
                    >
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={modeValue === 'base'}
                        {...register('amountQuote')}
                      />
                    </FormRow>
                  </div>

                  {modeValue === 'both' && (
                    <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                        <Info className="w-4 h-4" />
                        <span className="text-sm font-medium">Balanced Deposits</span>
                      </div>
                      <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                        When depositing both tokens, they will be balanced according to the current price ratio in your selected range.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button type="button" onClick={handleBack} variant="outline" className="flex items-center gap-2">
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button 
                      type="button" 
                      onClick={handleNext}
                      disabled={!canProceedToReview}
                      className="flex items-center gap-2"
                    >
                      Review Position
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </TabsContent>

                {/* Review Step */}
                <TabsContent value="review" className="space-y-4 mt-0">
                  <div style={{
                    background: 'linear-gradient(135deg, #2a2a5c 0%, #3a3a6b 100%)',
                    border: '1px solid #4a4a7b',
                    borderRadius: '0.75rem',
                    padding: '1.5rem'
                  }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Review & Confirm</h3>
                      <p className="text-sm text-muted-foreground">Double-check your position details</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Position Summary</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pool:</span>
                          <span className="font-mono">{selectedPool?.tokenA} / {selectedPool?.tokenB}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Band Width:</span>
                          <span>{watch('bandBps')} bps ({(watch('bandBps') / 100).toFixed(2)}%)</span>
                        </div>
                        {bandInfo && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Price Range:</span>
                              <span className="font-mono">{bandInfo.binLower} → {bandInfo.binUpper}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Current Price:</span>
                              <span className="font-mono">{bandInfo.midPrice.toFixed(6)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Deposit Mode:</span>
                          <span className="capitalize">{modeValue === 'both' ? 'Both Tokens' : `${modeValue} Only`}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Amounts</h4>
                      <div className="space-y-2 text-sm">
                        {modeValue !== 'quote' && watch('amountBase') && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{selectedPool?.tokenA}:</span>
                            <span className="font-mono">{watch('amountBase')}</span>
                          </div>
                        )}
                        {modeValue !== 'base' && watch('amountQuote') && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{selectedPool?.tokenB}:</span>
                            <span className="font-mono">{watch('amountQuote')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!connected && (
                    <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">Wallet Required</span>
                      </div>
                      <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                        Connect your wallet to create the position.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button type="button" onClick={handleBack} variant="outline" className="flex items-center gap-2">
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <Button 
                      type="submit"
                      disabled={isSubmitting || !connected || poolStatus !== 'ready' || bandStatus !== 'ready'}
                      className="flex items-center gap-2"
                    >
                      {isSubmitting ? 'Creating Position...' : 'Create Position'}
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </TabsContent>
              </form>
            </Tabs>
          </SectionCard>
          </div>
        </motion.div>

        {/* Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent style={{
            background: 'linear-gradient(135deg, #1e1e3f 0%, #2a2a5c 100%)',
            border: '1px solid #3a3a6b',
            color: 'white'
          }}>
            <DialogHeader>
              <DialogTitle>Confirm Position Creation</DialogTitle>
              <DialogDescription>
                Are you sure you want to create this liquidity position? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            
            <div className="p-4 rounded-lg border bg-muted/50 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pool:</span>
                <span className="font-mono">{selectedPool?.tokenA} / {selectedPool?.tokenB}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Band Width:</span>
                <span>{watch('bandBps')} bps</span>
              </div>
              {modeValue !== 'quote' && watch('amountBase') && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{selectedPool?.tokenA}:</span>
                  <span className="font-mono">{watch('amountBase')}</span>
                </div>
              )}
              {modeValue !== 'base' && watch('amountQuote') && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{selectedPool?.tokenB}:</span>
                  <span className="font-mono">{watch('amountQuote')}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Confirm & Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </TooltipProvider>
    </div>
  );
}
