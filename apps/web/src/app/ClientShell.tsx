"use client";

import "@solana/wallet-adapter-react-ui/styles.css";

import React, { type ReactNode, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, Globe, Zap, Menu, X } from "lucide-react";
import ToastProvider from "@/components/ui/ToastProvider";
import WalletContextProvider from "@/components/wallet/WalletContextProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useBotHealth } from "@/hooks/useBotHealth";

const parseEnvBoolean = (value?: string): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
};

let AppStateProvider: React.ComponentType<{ children: ReactNode }>;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AppStateProvider = require("@/lib/store/AppStateProvider").default;
} catch {
  AppStateProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
}

export default function ClientShell({ children }: { children: ReactNode }): JSX.Element {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const cluster = process.env.NEXT_PUBLIC_CLUSTER ?? "";
  const mockModeFlag = parseEnvBoolean(process.env.NEXT_PUBLIC_MOCK_MODE);
  const botHealthUrl = (process.env.NEXT_PUBLIC_BOT_HEALTH_URL ?? "").trim();
  const { loading: botHealthLoading, ok: botHealthOk, dryRun: botHealthDryRun } = useBotHealth(
    botHealthUrl.length > 0 ? botHealthUrl : undefined,
  );

  const showDevnetBanner = cluster.trim().toLowerCase() === "devnet";
  const showMockBanner = mockModeFlag;
  const showDryRunBanner =
    botHealthUrl.length > 0 && !botHealthLoading && (!botHealthOk || botHealthDryRun);

  const banners: Array<{ key: string; text: string; className: string; icon: React.ReactNode }> = [];
  if (showDevnetBanner) {
    banners.push({ 
      key: "devnet", 
      text: "Devnet by default", 
      className: "bg-indigo-900/40 text-indigo-200",
      icon: <Globe className="h-3 w-3" />
    });
  }
  if (showMockBanner) {
    banners.push({
      key: "mock-mode",
      text: "Experimental / Mock mode enabled",
      className: "bg-amber-900/40 text-amber-200",
      icon: <Zap className="h-3 w-3" />
    });
  }
  if (showDryRunBanner) {
    banners.push({
      key: "dry-run",
      text: "Dry-run: Telegram bot not connected",
      className: "bg-rose-900/40 text-rose-200",
      icon: <Bot className="h-3 w-3" />
    });
  }

  return (
    <ToastProvider>
      <AppStateProvider>
        <WalletContextProvider>
          <div className="min-h-screen bg-slate-950 text-slate-50">
            {/* Status Banners */}
            {banners.length > 0 && (
              <div className="w-full">
                {banners.map((banner) => (
                  <div
                    key={banner.key}
                    className={`${banner.className} flex items-center justify-center gap-2 px-4 py-2 text-center text-xs font-medium w-full`}
                  >
                    {banner.icon}
                    {banner.text}
                  </div>
                ))}
              </div>
            )}
            
            {/* Navigation Bar */}
            <nav 
              className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm shadow-lg"
              style={{ 
                position: 'sticky',
                top: 0,
                zIndex: 50,
                width: '100%',
                borderBottom: '1px solid rgb(30 41 59)',
                backgroundColor: 'rgba(15 23 42 / 0.95)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
              }}
            >
              <div 
                className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8"
                style={{ 
                  maxWidth: '72rem', 
                  margin: '0 auto', 
                  padding: '0 1rem',
                  width: '100%'
                }}
              >
                <div 
                  className="flex h-16 items-center justify-between"
                  style={{ 
                    display: 'flex',
                    height: '4rem',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div 
                    className="flex items-center space-x-8"
                    style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}
                  >
                    <Link 
                      className="text-2xl font-bold text-slate-50 hover:text-blue-400 transition-colors" 
                      href="/"
                      style={{ 
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: 'rgb(248 250 252)',
                        textDecoration: 'none',
                        transition: 'color 0.2s',
                        letterSpacing: '-0.025em'
                      }}
                    >
                      🚀 Saros
                    </Link>
                    <div 
                      className="desktop-nav"
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <Link 
                        href="/" 
                        className="text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 px-4 py-3 rounded-lg text-base font-medium transition-colors"
                        style={{
                          color: 'rgb(203 213 225)',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '1rem',
                          fontWeight: '500',
                          textDecoration: 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        Dashboard
                      </Link>
                      <Link 
                        href="/positions/new" 
                        className="text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 px-4 py-3 rounded-lg text-base font-medium transition-colors"
                        style={{
                          color: 'rgb(203 213 225)',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '1rem',
                          fontWeight: '500',
                          textDecoration: 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        Create Position
                      </Link>
                      <Link 
                        href="/orders" 
                        className="text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 px-4 py-3 rounded-lg text-base font-medium transition-colors"
                        style={{
                          color: 'rgb(203 213 225)',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '1rem',
                          fontWeight: '500',
                          textDecoration: 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        Advanced Orders
                      </Link>
                      <Link 
                        href="/analytics" 
                        className="text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 px-4 py-3 rounded-lg text-base font-medium transition-colors"
                        style={{
                          color: 'rgb(203 213 225)',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          fontSize: '1rem',
                          fontWeight: '500',
                          textDecoration: 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        Analytics
                      </Link>
                    </div>
                  </div>
                  <div 
                    className="flex items-center gap-4"
                    style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
                  >
                    {/* Mobile menu button */}
                    <button
                      className="md:hidden p-2 text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 rounded-md transition-colors"
                      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                      style={{
                        padding: '0.5rem',
                        color: 'rgb(203 213 225)',
                        borderRadius: '0.375rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                    
                    <div style={{ marginRight: '0.5rem' }}>
                      <ThemeToggle />
                    </div>
                    
                    <div style={{ marginLeft: '0.5rem' }}>
                      <WalletMultiButton />
                    </div>
                  </div>
                </div>
              </div>
              {/* Mobile Navigation Menu */}
              {mobileMenuOpen && (
                <motion.div 
                  className="md:hidden border-t border-slate-800 bg-slate-900/95"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="w-full max-w-6xl mx-auto px-4 py-2 space-y-1">
                    <Link 
                      href="/" 
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 rounded-md transition-colors"
                    >
                      Dashboard
                    </Link>
                    <Link 
                      href="/positions/new" 
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 rounded-md transition-colors"
                    >
                      Create Position
                    </Link>
                    <Link 
                      href="/orders" 
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 rounded-md transition-colors"
                    >
                      Advanced Orders
                    </Link>
                    <Link 
                      href="/analytics" 
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full px-3 py-2 text-sm font-medium text-slate-300 hover:text-slate-50 hover:bg-slate-800/50 rounded-md transition-colors"
                    >
                      Analytics
                    </Link>
                  </div>
                </motion.div>
              )}
            </nav>
            
            {/* Main Content Area */}
            <main className="flex-1 w-full" style={{ width: '100%' }}>
              <div 
                className="w-full max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8"
                style={{ 
                  maxWidth: '72rem', 
                  margin: '0 auto', 
                  padding: '2rem 1rem',
                  width: '100%'
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="w-full"
                  style={{ width: '100%' }}
                >
                  {children}
                </motion.div>
              </div>
            </main>
          </div>
        </WalletContextProvider>
      </AppStateProvider>
    </ToastProvider>
  );
}
