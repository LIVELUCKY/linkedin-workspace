import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getArticlesDir, setArticlesDir } from '@/lib/workspace';

export async function GET() {
  return NextResponse.json({ articlesPath: getArticlesDir() });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { articlesPath: string };
  const articlesPath = body.articlesPath?.trim();

  if (!articlesPath) {
    return NextResponse.json({ error: 'articlesPath required' }, { status: 400 });
  }
  if (!fs.existsSync(articlesPath) || !fs.statSync(articlesPath).isDirectory()) {
    return NextResponse.json({ error: 'Directory not found' }, { status: 400 });
  }

  setArticlesDir(articlesPath);
  return NextResponse.json({ ok: true, articlesPath });
}
