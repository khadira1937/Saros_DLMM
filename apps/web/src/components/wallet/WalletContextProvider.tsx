"use client";

import { ReactNode, useMemo } from 'react';
import { clusterApiUrl, type Cluster } from '@solana/web3.js';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

interface WalletContextProviderProps {
  children: ReactNode;
}

const resolveNetwork = (): WalletAdapterNetwork => {
  const envNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  switch (envNetwork) {
    case WalletAdapterNetwork.Mainnet:
    case 'mainnet-beta':
      return WalletAdapterNetwork.Mainnet;
    case WalletAdapterNetwork.Testnet:
    case 'testnet':
      return WalletAdapterNetwork.Testnet;
    case WalletAdapterNetwork.Devnet:
    case 'devnet':
    default:
      return WalletAdapterNetwork.Devnet;
  }
};

export default function WalletContextProvider({ children }: WalletContextProviderProps): JSX.Element {
  const network = resolveNetwork();
  const clusterMap: Record<WalletAdapterNetwork, Cluster> = {
    [WalletAdapterNetwork.Devnet]: 'devnet',
    [WalletAdapterNetwork.Testnet]: 'testnet',
    [WalletAdapterNetwork.Mainnet]: 'mainnet-beta',
  };

  const cluster = clusterMap[network];
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(cluster);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
