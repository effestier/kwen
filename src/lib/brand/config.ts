// Brand Configuration
// Centralized brand settings for KWEN

export interface BrandConfig {
  name: string;
  shortName: string;
  tagline: string;
  domain: string;
  logo: {
    symbol: string;
    icon: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  social: {
    website: string;
    supportEmail: string;
  };
  auth: {
    siteUrl: string;
    redirectUrl: string;
  };
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kwen.in';

export const BRAND: BrandConfig = {
  name: 'KWEN',
  shortName: 'KWEN',
  tagline: 'Connect. Share. Discover.',
  domain: 'kwen.in',
  logo: {
    symbol: 'K',
    icon: '⬡',
  },
  colors: {
    primary: '#ffffff',
    secondary: '#888888',
    accent: '#ffffff',
  },
  social: {
    website: siteUrl,
    supportEmail: 'support@kwen.in',
  },
  auth: {
    siteUrl,
    redirectUrl: `${siteUrl}/auth/callback`,
  },
};

// Export for easy imports
export default BRAND;
export const { name, domain, tagline } = BRAND;