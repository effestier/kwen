import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand/config';

export const metadata: Metadata = {
  title: 'KWEN',
  description: 'Connect. Share. Grow.',
  metadataBase: new URL(BRAND.auth.siteUrl),

  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
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
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}