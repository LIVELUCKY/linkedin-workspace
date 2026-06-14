import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), '.workspace.json');

export function getArticlesDir(): string | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as { articlesPath?: string };
      return cfg.articlesPath ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

export function setArticlesDir(articlesPath: string): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ articlesPath }, null, 2));
}
