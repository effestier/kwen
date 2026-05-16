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
    primary: '#0095f6',
    secondary: '#0095f6',
    accent: '#0095f6',
  },
  social: {
    website: 'https://kwen.in',
    supportEmail: 'support@kwen.in',
  },
  auth: {
    siteUrl: 'https://kwen.in',
    redirectUrl: 'https://kwen.in/auth/callback',
  },
};

// Export for easy imports
export default BRAND;
export const { name, domain, tagline } = BRAND;