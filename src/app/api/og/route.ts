import { NextRequest, NextResponse } from 'next/server';

// Fetch a URL's Open Graph tags so the preview can render LinkedIn's link card.
// No API key, no quota — just reads the page server-side.

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function meta(html: string, key: string): string {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (a) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'));
  return b ? b[1] : '';
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'bad url' }, { status: 400 });
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkedInBot/1.0)' },
      redirect: 'follow',
    });
    const html = (await res.text()).slice(0, 600_000);
    const title = decode(meta(html, 'og:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''));
    const description = decode(meta(html, 'og:description') || meta(html, 'description'));
    let image = meta(html, 'og:image') || meta(html, 'og:image:url');
    const domain = new URL(url).hostname.replace(/^www\./, '');
    if (image && image.startsWith('//')) image = 'https:' + image;
    if (image && image.startsWith('/')) image = new URL(image, url).href;
    return NextResponse.json({ title, description, image, domain });
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
  }
}
