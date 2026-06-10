import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand/config';

export const dynamic = 'force-static';

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          position: 'relative',
        }}
      >
        {/* Gradient accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #666666, #999999, #cccccc)',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #555555, #999999)',
            marginBottom: '32px',
          }}
        >
          <span style={{ fontSize: '36px', fontWeight: 700, color: 'white' }}>
            {BRAND.logo.symbol}
          </span>
        </div>

        {/* Name */}
        <span
          style={{
            fontSize: '64px',
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.02em',
            marginBottom: '16px',
          }}
        >
          {BRAND.name}
        </span>

        {/* Tagline */}
        <span
          style={{
            fontSize: '28px',
            color: '#a1a1aa',
          }}
        >
          {BRAND.tagline}
        </span>

        {/* Domain */}
        <span
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '18px',
            color: '#52525b',
          }}
        >
          {BRAND.domain}
        </span>
      </div>
    ),
    { ...size }
  );
}
