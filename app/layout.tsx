import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Mochi Protocol | Robot Cat Metroidvania',
  description: 'Play the Mochi Protocol Unity WebGL build and explore GenLayer Intelligent Contract records for oath, final decision, and weekly speedruns.',
  icons: {
    icon: [
      { url: '/site/mochi-face.png', type: 'image/png' },
    ],
    shortcut: '/site/mochi-face.png',
    apple: '/site/mochi-face.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
