import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=(), join-ad-interest-group=(), run-ad-auction=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'off',
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
  {
    key: 'Cross-Origin-Embedder-Policy',
    value: 'credentialless',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://*.supabase.co https://*.supabase.in https://*.supabase.com https://challenges.cloudflare.com",
      "media-src 'self' blob: https://*.supabase.co https://*.supabase.in https://*.supabase.com",
      "font-src 'self' data:",
      "connect-src 'self' https://unpkg.com https://*.supabase.co https://*.supabase.in https://*.supabase.com wss://*.supabase.co wss://*.supabase.in wss://*.supabase.com https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isCapacitorBuild ? { output: 'export', trailingSlash: true } : {}),
  images: {
    ...(isCapacitorBuild ? { unoptimized: true } : {}),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  ...(isCapacitorBuild ? {} : {
    compiler: {
      removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
    },
    serverExternalPackages: ['@supabase/supabase-js'],
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: securityHeaders,
        },
      ];
    },
  }),
};

export default nextConfig;
