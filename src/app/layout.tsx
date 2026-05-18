import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand/config';

export const metadata: Metadata = {
  title: 'KWEN',
  description: 'Connect. Share. Grow.',
  metadataBase: new URL(BRAND.auth.siteUrl),

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
                  var theme = stored || 'system';
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
      </head>
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}