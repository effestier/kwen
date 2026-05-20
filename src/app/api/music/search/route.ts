import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Uses Deezer API — free, no API key, returns 30s previews
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 50);

  if (!query) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      return NextResponse.json({ tracks: [] });
    }

    const data = await res.json();

    const tracks = (data.data || []).map((track: any) => ({
      id: track.id,
      name: track.title,
      artist: track.artist?.name || 'Unknown',
      previewUrl: track.preview, // 30s MP3 preview
      coverUrl: track.album?.cover_medium || track.album?.cover || '',
      duration: track.duration,
    }));

    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ tracks: [] });
  }
}
