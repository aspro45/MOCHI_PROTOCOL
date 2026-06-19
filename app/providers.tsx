'use client';

import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { studionet, testnetBradbury } from 'genlayer-js/chains';
import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || '';
const genlayerNetwork = getConfiguredGenLayerNetwork();
const genlayerDefaults = {
  bradbury: {
    chain: testnetBradbury,
    chainId: 4221,
    rpcUrl: 'https://rpc-bradbury.genlayer.com',
  },
  studionet: {
    chain: studionet,
    chainId: 61999,
    rpcUrl: 'https://studio.genlayer.com/api',
  },
}[genlayerNetwork];

const genlayerChain = {
  ...genlayerDefaults.chain,
  id: Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || genlayerDefaults.chainId),
  rpcUrls: {
    ...genlayerDefaults.chain.rpcUrls,
    default: {
      http: [process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim() || genlayerDefaults.rpcUrl],
    },
  },
};

const wagmiConfig = getDefaultConfig({
  appName: 'Mochi Protocol',
  projectId: walletConnectProjectId,
  wallets: [
    {
      groupName: 'Browser Wallets',
      wallets: [injectedWallet],
    },
  ],
  chains: [genlayerChain],
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: '#35f1ff',
            accentColorForeground: '#031014',
            borderRadius: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function getConfiguredGenLayerNetwork() {
  const configured = process.env.NEXT_PUBLIC_GENLAYER_CHAIN?.trim().toLowerCase();
  if (!configured || configured === 'bradbury' || configured === 'testnet-bradbury' || configured === 'testnet_bradbury') {
    return 'bradbury';
  }

  if (configured === 'studionet') {
    return 'studionet';
  }

  throw new Error(`Unsupported GenLayer network: ${configured}`);
}
