import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

// GIF search disabled until API key is configured
export async function GET() {
  return NextResponse.json({ gifs: [], disabled: true });
}
