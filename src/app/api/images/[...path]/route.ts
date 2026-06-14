import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getArticlesDir } from '@/lib/workspace';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const dir = getArticlesDir();
  if (!dir) return new NextResponse('Not configured', { status: 412 });

  const { path: segments } = await params;
  const resolved = path.resolve(dir, ...segments);

  if (!resolved.startsWith(dir + path.sep)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!fs.existsSync(resolved)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const buffer = fs.readFileSync(resolved);
  return new NextResponse(buffer, { headers: { 'Content-Type': mime } });
}
