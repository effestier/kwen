import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand/config';
import { AntiTamper } from '@/components/security/anti-tamper';
import { ErrorBoundary } from '@/components/security/error-boundary';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description: 'Connect. Share. Discover. KWEN brings stories, messaging, posts, reels, and communities together in a fast, modern social experience.',
  metadataBase: new URL(BRAND.auth.siteUrl),
  alternates: {
    canonical: '/',
  },

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },

  manifest: '/site.webmanifest',

  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: 'Connect. Share. Discover. KWEN brings stories, messaging, posts, reels, and communities together in a fast, modern social experience.',
    url: BRAND.social.website,
    siteName: BRAND.name,
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/web-app-manifest-512x512.png',
        width: 512,
        height: 512,
        alt: 'KWEN',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: 'Connect. Share. Discover. KWEN brings stories, messaging, posts, reels, and communities together in a fast, modern social experience.',
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLdOrganization = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: BRAND.social.website,
    logo: `${BRAND.social.website}/web-app-manifest-512x512.png`,
    description: BRAND.tagline,
    sameAs: [BRAND.social.website],
    contactPoint: {
      '@type': 'ContactPoint',
      email: BRAND.social.supportEmail,
      contactType: 'customer service',
    },
  });

  const jsonLdWebSite = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND.name,
    url: BRAND.social.website,
    description: BRAND.tagline,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BRAND.social.website}/explore?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  });

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Hide all content immediately on native — prevents landing page flash */}
        <script src="/js/capacitor-splash.js" />
        {/* Inline script to apply theme before paint - prevents FOUC */}
        <script src="/js/theme-init.js" />
        {/* Service worker cleanup */}
        <script src="/js/sw-cleanup.js" defer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdOrganization }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdWebSite }}
        />
      </head>
      <body className="antialiased">
        <noscript>
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>KWEN — Connect. Share. Discover.</h1>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>Connect. Share. Discover. KWEN brings stories, messaging, posts, reels, and communities together in a fast, modern social experience.</p>
            <p style={{ fontSize: '0.875rem', color: '#999' }}>Please enable JavaScript to use KWEN.</p>
          </div>
        </noscript>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:text-black focus:text-sm focus:font-semibold">
          Skip to main content
        </a>
        <Providers>
          <AntiTamper />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}