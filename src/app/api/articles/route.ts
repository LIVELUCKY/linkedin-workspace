import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getArticlesDir } from '@/lib/workspace';

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function wordCount(content: string): number {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

export async function GET(req: NextRequest) {
  const dir = getArticlesDir();
  if (!dir) {
    return NextResponse.json({ error: 'not-configured' }, { status: 412 });
  }

  const { searchParams } = new URL(req.url);
  const file = searchParams.get('file');

  if (file) {
    const resolved = path.resolve(dir, file);
    if (!resolved.startsWith(dir + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    return NextResponse.json({ content });
  }

  // List all .md files with metadata
  const articles: { label: string; file: string; title: string; words: number; slug: string }[] = [];
  if (fs.existsSync(dir)) {
    for (const slug of fs.readdirSync(dir).sort()) {
      const slugDir = path.join(dir, slug);
      if (!fs.statSync(slugDir).isDirectory()) continue;
      for (const name of fs.readdirSync(slugDir).sort()) {
        if (!name.endsWith('.linkedin.md')) continue;
        const filePath = path.join(slugDir, name);
        const content = fs.readFileSync(filePath, 'utf-8');
        articles.push({
          label: `${slug}/${name}`,
          file: `${slug}/${name}`,
          title: extractTitle(content),
          words: wordCount(content),
          slug,
        });
      }
    }
  }
  return NextResponse.json({ articles });
}
