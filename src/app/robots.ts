import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/auth/', '/feed', '/messages', '/notifications', '/create', '/saved', '/settings', '/stories'],
      },
    ],
    sitemap: 'https://kwen.in/sitemap.xml',
  };
}
