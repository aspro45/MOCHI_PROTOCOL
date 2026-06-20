import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev https://*.r2.dev",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com",
  "connect-src 'self' https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev https://*.r2.dev https://rpc-bradbury.genlayer.com https://studio.genlayer.com https://explorer-bradbury.genlayer.com https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org https://*.reown.com wss://*.reown.com https://pulse.walletconnect.org https://api.web3modal.org",
  "media-src 'self' data: blob: https://pub-8eeae0f71eed47c698ccbf03daeb9f6d.r2.dev https://*.r2.dev",
  "manifest-src 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self)',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@react-native-async-storage/async-storage': false,
    };

    return config;
  },
};

export default nextConfig;

