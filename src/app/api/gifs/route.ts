import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TENOR_API_KEY = process.env.TENOR_API_KEY || '';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 50);

  if (!TENOR_API_KEY) {
    return NextResponse.json({ gifs: [] });
  }

  try {
    const endpoint = query
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=${limit}&media_filter=gif`
      : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=${limit}&media_filter=gif`;

    const res = await fetch(endpoint, { next: { revalidate: 60 } });

    if (!res.ok) {
      return NextResponse.json({ gifs: [] });
    }

    const data = await res.json();

    const gifs = (data.results || []).map((gif: any) => ({
      id: gif.id,
      title: gif.title || '',
      url: gif.media_formats?.mediumgif?.url || gif.media_formats?.tinygif?.url || '',
      previewUrl: gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url || '',
      dims: gif.media_formats?.mediumgif?.dims || [0, 0],
    }));

    return NextResponse.json({ gifs });
  } catch {
    return NextResponse.json({ gifs: [] });
  }
}
