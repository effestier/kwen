import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand/config';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0b',
};

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.tagline,
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
    title: BRAND.name,
    description: BRAND.tagline,
    url: BRAND.social.website,
    siteName: BRAND.name,
    locale: 'en_US',
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: BRAND.name,
    description: BRAND.tagline,
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to apply theme before paint - prevents FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('app_theme');
                  var theme = (stored === 'light' || stored === 'dark' || stored === 'system') ? stored : 'system';
                  var isDark;
                  if (theme === 'system') {
                    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  } else {
                    isDark = theme === 'dark';
                  }
                  var resolved = isDark ? 'dark' : 'light';
                  document.documentElement.setAttribute('data-theme', resolved);
                  document.documentElement.classList.add(resolved);
                  document.documentElement.classList.remove(isDark ? 'light' : 'dark');
                } catch(e) {}
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
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
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
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
            }),
          }}
        />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--accent-primary)] focus:text-white focus:text-sm focus:font-semibold">
          Skip to main content
        </a>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}