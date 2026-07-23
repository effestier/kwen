import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

// NOTE: Security headers (CSP, X-Frame-Options, etc.) are now applied
// centrally in src/middleware.ts to avoid middleware overwriting these values.
// Only headers that middleware can't set (or that need build-time config) stay here.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isCapacitorBuild ? { output: 'export', trailingSlash: true } : {}),
  async redirects() {
    return [
      {
        source: '/auth/signup',
        destination: '/auth/register',
        permanent: true,
      },
    ];
  },
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
  }),
};

export default nextConfig;
