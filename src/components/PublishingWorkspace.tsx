"use client";

import { track } from "@/lib/firebase";
import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Copy,
  FileText,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Settings,
  BookOpen,
  RefreshCw,
  X,
  HelpCircle,
  Wand2,
  Hash,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ArticleRef {
  label: string;
  file: string;
  title: string;
  words: number;
  slug: string;
}

const MAX_CHARS = 3000; // LinkedIn post hard limit
const FOLD_CHARS = 210; // roughly where the feed shows "…see more"
const LI_BLUE = "#0A66C2";

// ── Unicode formatting (LinkedIn strips real markup, so we fake it) ────────────

const BOLD = { U: 0x1d5d4, L: 0x1d5ee, D: 0x1d7ec as number | null };
const ITALIC = { U: 0x1d608, L: 0x1d622, D: null as number | null };
const BOLDITALIC = { U: 0x1d63c, L: 0x1d656, D: null as number | null };
const MONO = { U: 0x1d670, L: 0x1d68a, D: 0x1d7f6 as number | null };

function mapAlnum(text: string, base: { U: number; L: number; D: number | null }): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) out += String.fromCodePoint(base.U + (c - 65));
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(base.L + (c - 97));
    else if (base.D != null && c >= 48 && c <= 57) out += String.fromCodePoint(base.D + (c - 48));
    else out += ch;
  }
  return out;
}

// Inline markdown → unicode (bold/italic/code), links → "text (url)", images dropped
function richInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // LinkedIn has no anchor text — a link becomes the bare URL (it auto-cards it)
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, _t, u) => u)
    .replace(/\*\*\*([^*]+)\*\*\*/g, (_, x) => mapAlnum(x, BOLDITALIC))
    .replace(/(\*\*|__)([^*_]+)\1/g, (_m, _d, x) => mapAlnum(x, BOLD))
    .replace(/(\*|_)([^*_]+)\1/g, (_m, _d, x) => mapAlnum(x, ITALIC))
    .replace(/`([^`]+)`/g, (_, x) => mapAlnum(x, MONO));
}

// Same but strips emphasis to plain (used for headings, which we bold wholesale)
function plainInline(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_, _t, u) => u)
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/(\*\*|__)([^*_]+)\1/g, "$2")
    .replace(/(\*|_)([^*_]+)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1");
}

function toLinkedIn(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) { out.push(mapAlnum(raw, MONO)); continue; }

    const h = raw.match(/^#{1,6}\s+(.*)$/);
    if (h) { out.push(mapAlnum(plainInline(h[1]), BOLD)); continue; }

    if (/^(\s*)([-*+])\s+/.test(raw)) {
      out.push(raw.replace(/^(\s*)([-*+])\s+(.*)$/, (_, sp, _b, rest) => `${sp}• ${richInline(rest)}`));
      continue;
    }
    if (/^\s*\d+\.\s+/.test(raw)) {
      out.push(raw.replace(/^(\s*\d+\.\s+)(.*)$/, (_, pre, rest) => `${pre}${richInline(rest)}`));
      continue;
    }
    if (/^(---|\*\*\*|___)\s*$/.test(raw)) { out.push("⸻⸻⸻⸻⸻⸻"); continue; }

    const q = raw.match(/^>\s?(.*)$/);
    if (q) { out.push(q[1].trim() ? `“${richInline(q[1])}”` : ""); continue; }

    if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (/^\s*\|?[\s:|-]+\|[\s:|-]+\s*$/.test(raw)) continue; // separator row
      out.push(richInline(raw.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()).join("  ·  ")));
      continue;
    }

    out.push(richInline(raw));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Checker (LinkedIn-specific) ───────────────────────────────────────────────

type IssueLevel = "warn" | "info";
interface Issue { level: IssueLevel; msg: string; line: number; }

function lintLinkedIn(md: string): Issue[] {
  const issues: Issue[] = [];
  if (!md.trim()) return issues;
  const lines = md.split("\n");
  lines.forEach((ln, idx) => {
    const line = idx + 1;
    if (/!\[[^\]]*\]\([^)]*\)/.test(ln))
      issues.push({ level: "info", line, msg: "Image lifts into the media gallery below the post (first one is the cover)" });
    if (/^#{1,6}\s+/.test(ln))
      issues.push({ level: "info", line, msg: "No headings on LinkedIn — converted to Unicode bold" });
    if (/^```/.test(ln))
      issues.push({ level: "info", line, msg: "No code blocks — converted to monospace glyphs" });
    if (/^\s*\|.*\|\s*$/.test(ln) && /^\s*\|?[\s:|-]+\|/.test(lines[idx + 1] ?? ""))
      issues.push({ level: "warn", line, msg: "No tables on LinkedIn — flattened to a “·”-separated line" });
  });
  return issues.sort((a, b) => a.line - b.line);
}

// ── Setup screen ──────────────────────────────────────────────────────────────

function SetupScreen({ onSave, onEditorOnly }: { onSave: (p: string) => void; onEditorOnly: () => void }) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(pathStr: string) {
    const trimmed = pathStr.trim();
    if (!trimmed) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articlesPath: trimmed }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) setError(data.error ?? "Directory not found — paste the full absolute path");
      else onSave(trimmed);
    } catch {
      setError("Could not reach server");
    } finally {
      setSaving(false);
    }
  }

  async function handleBrowse() {
    setError("");
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" });
      const data = await res.json() as { path?: string; error?: string };
      if (res.ok && data.path) { setInput(data.path); await save(data.path); }
      else if (data.error && data.error !== "canceled") setError("Native picker unavailable — paste the path below instead");
    } catch {
      setError("Native picker unavailable — paste the path below instead");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white text-[#0F172A]">
      <div className="w-full max-w-md px-8">
        <div className="flex items-center gap-3 mb-8">
          <span className="bg-[#0A66C2] text-white text-sm font-bold w-8 h-8 flex items-center justify-center rounded">in</span>
          <span className="text-xl font-semibold tracking-tight">LinkedIn Workspace</span>
        </div>

        <h1 className="text-2xl font-bold mb-2">Set your posts folder</h1>
        <p className="text-[#64748B] text-sm mb-6">
          Point to the directory of post subfolders. Each holds a{" "}
          <code className="bg-[#F1F5F9] px-1 py-0.5 rounded text-xs">.linkedin.md</code> file.
        </p>

        <button
          type="button"
          onClick={handleBrowse}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#E2E8F0] rounded-lg py-4 text-sm text-[#64748B] hover:border-[#0A66C2] hover:text-[#0A66C2] transition-colors mb-3 cursor-pointer disabled:opacity-50"
        >
          <FolderOpen className="w-5 h-5" />
          {saving ? "Opening…" : "Choose folder…"}
        </button>

        <p className="text-xs text-[#94A3B8] mb-2">Or paste the full absolute path:</p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save(input)}
            placeholder="/Users/you/Desktop/posts"
            className="flex-1 border border-[#E2E8F0] rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-[#0A66C2] bg-[#FAFAFA]"
            autoFocus
          />
          <Button onClick={() => save(input)} disabled={!input.trim() || saving} className="bg-[#0A66C2] text-white hover:bg-[#004182] shrink-0">
            {saving ? "Saving…" : "Open"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3.5 h-3.5" />{error}
          </p>
        )}

        <div className="flex items-center gap-3 my-5">
          <span className="flex-1 h-px bg-[#E2E8F0]" />
          <span className="text-[10px] text-[#CBD5E1] uppercase tracking-widest">or</span>
          <span className="flex-1 h-px bg-[#E2E8F0]" />
        </div>
        <button type="button" onClick={onEditorOnly} className="w-full text-sm text-[#0A66C2] hover:underline">
          Just open the editor — paste a draft, no folder needed →
        </button>
      </div>
    </div>
  );
}

// ── Guide ─────────────────────────────────────────────────────────────────────

const GUIDE: { md: string; note: string }[] = [
  { md: "**bold**", note: "→ 𝗯𝗼𝗹𝗱 (Unicode — survives paste)" },
  { md: "*italic*", note: "→ 𝘪𝘵𝘢𝘭𝘪𝘤" },
  { md: "`code`", note: "→ 𝚌𝚘𝚍𝚎 (monospace)" },
  { md: "# Heading", note: "→ bold line (no real headings)" },
  { md: "- item", note: "→ • item" },
  { md: "[text](url)", note: "→ bare URL (LinkedIn cards it; no anchor text)" },
  { md: "#hashtag", note: "Clickable on LinkedIn — use 3–5" },
  { md: "@name", note: "Only mentions if typed in LinkedIn's box" },
  { md: "![alt](img)", note: "→ media gallery below (first = cover)" },
];

function Guide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-[#E2E8F0]">
          <span className="font-semibold text-sm">How Markdown maps to LinkedIn</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F1F5F9] text-[#64748B]"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto custom-scroll p-3 space-y-1.5">
          {GUIDE.map((g) => (
            <div key={g.note} className="flex items-center gap-3 text-sm">
              <code className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded px-2 py-1 font-mono text-xs whitespace-pre text-[#0F172A]">{g.md}</code>
              <span className="flex-1 text-[#64748B] text-xs">{g.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Render converted text with hashtags + URLs in LinkedIn blue
function RichText({ text }: { text: string }) {
  const parts = text.split(/(#[\p{L}0-9_]+|https?:\/\/\S+)/gu);
  return (
    <>
      {parts.map((p, i) =>
        /^#[\p{L}0-9_]+$/u.test(p) || /^https?:\/\//.test(p)
          ? <span key={i} style={{ color: LI_BLUE }} className="font-medium">{p}</span>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

// True when built for GitHub Pages — no server, no API routes, editor-only.
const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_MODE === '1';

// ── Main workspace ────────────────────────────────────────────────────────────

export default function PublishingWorkspace() {
  const [configured, setConfigured] = useState<boolean | null>(IS_STATIC ? false : null);
  const [articlesPath, setArticlesPath] = useState("");
  const [articles, setArticles] = useState<ArticleRef[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [editorOnly, setEditorOnly] = useState(IS_STATIC);
  const [refreshing, setRefreshing] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<"editor" | "preview">("editor");
  const [authorName, setAuthorName] = useState("Your Name");
  const [authorHeadline, setAuthorHeadline] = useState("Your headline");
  const [og, setOg] = useState<{ title: string; description: string; image: string; domain: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Check config on mount (skipped in static/hosted mode — no server available)
  useEffect(() => {
    if (IS_STATIC) return;
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: { articlesPath: string | null }) => {
        if (d.articlesPath) { setArticlesPath(d.articlesPath); setConfigured(true); }
        else setConfigured(false);
      })
      .catch(() => setConfigured(false));
  }, []);

  // Custom author identity for the preview, persisted locally
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("li_author") ?? "null") as { name?: string; headline?: string } | null;
      if (saved?.name) setAuthorName(saved.name);
      if (saved?.headline) setAuthorHeadline(saved.headline);
    } catch { /* ignore */ }
  }, []);
  const saveAuthor = (name: string, headline: string) => {
    try { localStorage.setItem("li_author", JSON.stringify({ name, headline })); } catch { /* ignore */ }
  };

  const loadArticleList = useCallback(async () => {
    try {
      const res = await fetch("/api/articles");
      if (res.status === 412) { setConfigured(false); return; }
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { articles: ArticleRef[] };
      setArticles(data.articles ?? []);
      return data.articles ?? [];
    } catch {
      toast.error("Could not load post list");
      return [];
    }
  }, []);

  const loadArticle = useCallback(async (file: string) => {
    try {
      const res = await fetch(`/api/articles?file=${encodeURIComponent(file)}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { content: string };
      setMarkdown(data.content);
      setActiveFile(file);
      setExpanded(false);
      track("post_selected", { slug: file.split("/")[0] });
    } catch {
      toast.error("Failed to load post");
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    loadArticleList().then((list) => {
      if (list && list.length > 0 && !activeFile) loadArticle(list[0].file);
    });
  }, [configured, loadArticleList, loadArticle, activeFile]);

  const refresh = async () => {
    setRefreshing(true);
    const list = await loadArticleList();
    if (list && activeFile && list.find((a) => a.file === activeFile)) await loadArticle(activeFile);
    setRefreshing(false);
    toast.success("Refreshed");
    track("posts_refreshed");
  };

  const converted = toLinkedIn(markdown);
  const charCount = [...converted].length;
  const firstUrl = converted.match(/https?:\/\/[^\s)]+/)?.[0] ?? "";

  // LinkedIn builds a link card from the first URL's Open Graph tags
  useEffect(() => {
    if (!firstUrl) { setOg(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/og?url=${encodeURIComponent(firstUrl)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled) setOg(d && !d.error ? d : null); })
        .catch(() => { if (!cancelled) setOg(null); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [firstUrl]);

  const copyForLinkedIn = async () => {
    try {
      await navigator.clipboard.writeText(converted);
      track("copy_for_linkedin", { char_count: charCount });
      toast.success("Copied LinkedIn-ready text — paste into the composer");
    } catch {
      toast.error("Clipboard write failed");
    }
  };

  const formatMarkdown = async () => {
    if (!markdown.trim()) return;
    setFormatting(true);
    try {
      const [prettier, mdPlugin] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/markdown"),
      ]);
      setMarkdown(await prettier.format(markdown, { parser: "markdown", plugins: [mdPlugin.default], proseWrap: "preserve" }));
      track("markdown_formatted");
      toast.success("Formatted");
    } catch {
      toast.error("Could not format");
    } finally {
      setFormatting(false);
    }
  };

  const syncGutter = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const st = e.currentTarget.scrollTop;
    if (gutterRef.current) gutterRef.current.scrollTop = st;
    if (overlayRef.current) overlayRef.current.style.transform = `translateY(${-st}px)`;
  };
  const jumpToLine = (line: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = markdown.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.scrollTop = Math.max(0, (line - 4) * 24);
  };

  const handleConfigSave = (p: string) => {
    setArticlesPath(p);
    setConfigured(true);
    setEditorOnly(false);
    setShowSettings(false);
    setArticles([]);
    setActiveFile("");
    setMarkdown("");
    track("folder_configured");
  };

  if (configured === null)
    return <div className="flex items-center justify-center h-screen bg-white text-[#64748B] text-sm">Loading…</div>;

  if (showSettings || (!configured && !editorOnly))
    return <SetupScreen onSave={handleConfigSave} onEditorOnly={() => { setEditorOnly(true); setShowSettings(false); }} />;

  const localMode = configured;
  const issues = lintLinkedIn(markdown);
  const lineCount = markdown.split("\n").length;
  const issuesByLine = new Map<number, Issue[]>();
  issues.forEach((iss) => {
    const arr = issuesByLine.get(iss.line) ?? [];
    arr.push(iss);
    issuesByLine.set(iss.line, arr);
  });
  const hashtagCount = (converted.match(/#[\p{L}0-9_]+/gu) ?? []).length;
  const overLimit = charCount > MAX_CHARS;

  // Images: LinkedIn pulls them OUT of the text into a media block below it
  const slug = activeFile.split("/")[0];
  const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m, i) => ({ alt: m[1].trim(), src: m[2].trim(), n: i + 1 }));
  const resolveImg = (src: string) => (src.startsWith("http") ? src : localMode && slug ? `/api/images/${slug}/${src}` : "");
  // A link only unfurls when there's no media (media takes precedence on LinkedIn)
  const showCard = images.length === 0;

  const foldText = [...converted].slice(0, FOLD_CHARS).join("");
  const isTruncated = charCount > FOLD_CHARS;
  const shownText = expanded || !isTruncated ? converted : foldText;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[100dvh] bg-white text-[#0F172A]">
        {/* TOPBAR */}
        <div className="flex h-12 border-b border-[#E2E8F0] px-4 items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="bg-[#0A66C2] text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded">in</span>
            <span className="font-semibold text-sm">LinkedIn Workspace</span>
          </div>
          <span className="text-xs text-[#64748B] truncate max-w-xs hidden sm:block">
            {localMode ? (articles.find((a) => a.file === activeFile)?.title || "Post") : "Scratch draft"}
          </span>
          <div className="flex items-center gap-2">
            {localMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={refresh} className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B]">
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Refresh posts</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => { setShowGuide(true); track("guide_opened"); }} className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B]">
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Formatting guide</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setShowSettings(true)} className="p-1.5 rounded hover:bg-[#F1F5F9] text-[#64748B]">
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Change posts folder</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={copyForLinkedIn} size="sm" className="bg-[#0A66C2] text-white hover:bg-[#004182] text-xs h-8 ml-1">
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  <span className="sm:hidden">Copy</span>
                  <span className="hidden sm:inline">Copy for LinkedIn</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy converted text — paste into the composer</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* MOBILE TABS — only visible on small screens */}
        <div className="flex md:hidden border-b border-[#E2E8F0] shrink-0">
          <button
            onClick={() => setActivePanel("editor")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activePanel === "editor" ? "border-b-2 border-[#0A66C2] text-[#0A66C2]" : "text-[#64748B]"}`}
          >
            Write
          </button>
          <button
            onClick={() => setActivePanel("preview")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activePanel === "preview" ? "border-b-2 border-[#0A66C2] text-[#0A66C2]" : "text-[#64748B]"}`}
          >
            Preview
          </button>
        </div>

        {/* MAIN */}
        <div className="flex-1 flex min-h-0">
          {/* SIDEBAR (local mode) */}
          {localMode && (
            <div className="w-56 shrink-0 border-r border-[#E2E8F0] flex flex-col bg-[#FAFAFA]">
              <div className="px-3 py-2 text-[10px] tracking-widest text-[#94A3B8] uppercase font-semibold border-b border-[#E2E8F0] flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" /> Posts
                <span className="ml-auto text-[#CBD5E1]">{articles.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scroll py-1">
                {articles.map((article) => {
                  const isActive = activeFile === article.file;
                  return (
                    <button
                      key={article.file}
                      onClick={() => loadArticle(article.file)}
                      className={`w-full text-left px-3 py-2.5 rounded-md mx-1 mb-0.5 ${isActive ? "bg-[#0A66C2] text-white" : "hover:bg-[#F1F5F9]"}`}
                      style={{ width: "calc(100% - 8px)" }}
                    >
                      <div className="font-medium text-sm truncate leading-tight">{article.title || article.slug}</div>
                      <div className={`text-[11px] mt-0.5 truncate ${isActive ? "text-blue-100" : "text-[#94A3B8]"}`}>
                        {article.words.toLocaleString()} words · {article.slug}
                      </div>
                    </button>
                  );
                })}
                {articles.length === 0 && (
                  <div className="px-3 py-6 text-xs text-[#94A3B8] text-center flex flex-col items-center gap-2">
                    <FileText className="w-6 h-6 text-[#CBD5E1]" />
                    <span>No <code>.linkedin.md</code> posts in<br /><code className="text-[10px] break-all">{articlesPath}</code></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EDITOR */}
          <div className={`flex-1 flex-col border-r border-[#E2E8F0] min-w-0 ${activePanel === "preview" ? "hidden md:flex" : "flex"}`}>
            <div className="px-4 py-2 border-b border-[#E2E8F0] text-[10px] text-[#94A3B8] uppercase tracking-widest font-semibold shrink-0 flex items-center justify-between">
              <span>Markdown draft</span>
              <button onClick={formatMarkdown} disabled={formatting || !markdown.trim()} className="flex items-center gap-1 normal-case tracking-normal text-[11px] text-[#64748B] hover:text-[#0A66C2] disabled:opacity-40">
                <Wand2 className="w-3 h-3" /> {formatting ? "Formatting…" : "Format"}
              </button>
            </div>
            <div className="flex-1 flex min-h-0 bg-[#FAFAFA]">
              <div ref={gutterRef} className="shrink-0 overflow-hidden pt-4 pb-4 text-right select-none bg-[#F4F4F5] border-r border-[#E8E8E8]" style={{ width: 44 }}>
                {Array.from({ length: lineCount }, (_, i) => {
                  const ln = i + 1;
                  const li = issuesByLine.get(ln);
                  const worst = li?.some((x) => x.level === "warn") ? "warn" : li ? "info" : null;
                  const dot = worst === "warn" ? "bg-[#F97316]" : worst === "info" ? "bg-[#94A3B8]" : "";
                  return (
                    <div
                      key={ln}
                      onClick={() => li && jumpToLine(ln)}
                      title={li?.map((x) => x.msg).join("\n")}
                      className={`h-6 leading-6 pr-2 pl-1.5 font-mono text-[11px] flex items-center justify-end gap-1 ${li ? "cursor-pointer text-[#0F172A]" : "text-[#CBD5E1]"}`}
                    >
                      {worst && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                      {ln}
                    </div>
                  );
                })}
              </div>
              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={textareaRef}
                  onScroll={syncGutter}
                  className="absolute inset-0 w-full h-full px-3 py-4 font-mono text-sm leading-6 bg-[#FAFAFA] resize-none outline-none custom-scroll text-[#0F172A] whitespace-pre overflow-auto"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  spellCheck={false}
                  wrap="off"
                  placeholder={localMode ? "Select a post from the sidebar…" : "Write your post in Markdown — we’ll convert it for LinkedIn…"}
                />
                {/* Inline lens — the note shown on the offending line */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div ref={overlayRef} className="relative will-change-transform">
                    {[...issuesByLine.entries()].map(([ln, arr]) => {
                      const worst = arr.some((x) => x.level === "warn") ? "warn" : "info";
                      const cls = worst === "warn" ? "bg-orange-50 text-[#C2410C]" : "bg-slate-100 text-[#64748B]";
                      const extra = arr.length > 1 ? `  +${arr.length - 1} more` : "";
                      return (
                        <div key={ln} className="absolute right-3 flex items-center justify-end h-6" style={{ top: 16 + (ln - 1) * 24, maxWidth: "70%" }}>
                          <span className={`pointer-events-auto cursor-pointer truncate rounded px-2 py-0.5 text-[11px] ${cls}`} title={arr.map((x) => x.msg).join("\n")} onClick={() => jumpToLine(ln)}>
                            {arr[0].msg}{extra}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PREVIEW — LinkedIn post card */}
          <div className={`flex-1 flex-col min-w-0 overflow-hidden bg-[#F4F2EE] ${activePanel === "editor" ? "hidden md:flex" : "flex"}`}>
            <div className="px-4 py-2 border-b border-[#E2E8F0] text-[10px] text-[#94A3B8] uppercase tracking-widest font-semibold shrink-0 bg-white">
              LinkedIn preview
            </div>
            <div className="flex-1 overflow-y-auto custom-scroll p-6 flex justify-center">
              <div className="w-full max-w-[560px] bg-white rounded-lg border border-[#E2E8F0] shadow-sm h-fit">
                {/* author (editable — saved locally) */}
                <div className="flex items-center gap-2 p-4 pb-2">
                  <div className="w-12 h-12 rounded-full bg-[#0A66C2] text-white flex items-center justify-center font-semibold shrink-0">
                    {authorName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "in"}
                  </div>
                  <div className="leading-tight min-w-0 flex-1">
                    <input
                      value={authorName}
                      onChange={(e) => { setAuthorName(e.target.value); saveAuthor(e.target.value, authorHeadline); }}
                      placeholder="Your Name"
                      className="block w-full text-sm font-semibold text-[#0F172A] bg-transparent outline-none rounded px-1 -mx-1 hover:bg-[#F3F6F8] focus:bg-[#F3F6F8]"
                    />
                    <input
                      value={authorHeadline}
                      onChange={(e) => { setAuthorHeadline(e.target.value); saveAuthor(authorName, e.target.value); }}
                      placeholder="Your headline"
                      className="block w-full text-xs text-[#64748B] bg-transparent outline-none rounded px-1 -mx-1 hover:bg-[#F3F6F8] focus:bg-[#F3F6F8]"
                    />
                    <div className="text-xs text-[#64748B] px-1 -mx-1">Now · 🌐</div>
                  </div>
                </div>
                {/* body */}
                <div className="px-4 pb-3 text-[14px] leading-[1.5] text-[#1d1d1d] whitespace-pre-wrap break-words" style={{ fontFamily: "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" }}>
                  {converted.trim() ? (
                    <>
                      <RichText text={shownText} />
                      {isTruncated && !expanded && (
                        <button onClick={() => setExpanded(true)} className="text-[#64748B] hover:text-[#0A66C2]">…see more</button>
                      )}
                    </>
                  ) : (
                    <span className="text-[#94A3B8]">Your post preview will appear here.</span>
                  )}
                </div>
                {/* MEDIA — LinkedIn lifts every image out of the text into a gallery below it */}
                {images.length > 0 && (
                  <div className="mb-3 border-t border-b border-[#E2E8F0]">
                    {images.length === 1 ? (
                      <div className="bg-[#EEF1F5] max-h-[420px] overflow-hidden flex items-center justify-center">
                        {resolveImg(images[0].src)
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={resolveImg(images[0].src)} alt={images[0].alt} className="w-full object-cover" />
                          : <div className="py-16 text-xs text-[#94A3B8]">🖼 {images[0].alt || images[0].src}</div>}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-0.5 bg-white">
                        {images.slice(0, 4).map((im, i) => (
                          <div key={im.n} className="relative bg-[#EEF1F5] aspect-square overflow-hidden flex items-center justify-center">
                            {resolveImg(im.src)
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={resolveImg(im.src)} alt={im.alt} className="w-full h-full object-cover" />
                              : <div className="text-[11px] text-[#94A3B8] px-2 text-center">🖼 {im.alt || im.src}</div>}
                            {i === 0 && <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">Cover</span>}
                            {i === 3 && images.length > 4 && (
                              <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-lg font-semibold">+{images.length - 4}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* LINK CARD — only when there's no media (media wins on LinkedIn) */}
                {showCard && og && (og.title || og.image) && (
                  <a href={firstUrl} target="_blank" rel="noopener noreferrer" className="block mx-4 mb-3 border border-[#E2E8F0] rounded overflow-hidden hover:bg-[#F3F6F8]">
                    {og.image && (
                      <div className="bg-[#EEF1F5]" style={{ aspectRatio: "1.91 / 1" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={og.image} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="px-3 py-2">
                      <div className="text-[13px] font-semibold text-[#0F172A] line-clamp-2">{og.title || og.domain}</div>
                      {og.description && <div className="text-[12px] text-[#64748B] line-clamp-1 mt-0.5">{og.description}</div>}
                      <div className="text-[11px] text-[#64748B] mt-0.5">{og.domain}</div>
                    </div>
                  </a>
                )}
                {showCard && firstUrl && !og && (
                  <div className="mx-4 mb-3 border border-dashed border-[#E2E8F0] rounded px-3 py-2 text-[12px] text-[#94A3B8]">
                    Fetching link preview for {firstUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}…
                  </div>
                )}
                {/* reactions bar */}
                <div className="border-t border-[#E2E8F0] px-4 py-1.5 flex justify-around text-xs text-[#64748B]">
                  {["Like", "Comment", "Repost", "Send"].map((a) => (
                    <span key={a} className="px-2 py-1">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="h-9 border-t border-[#E2E8F0] flex items-center px-4 gap-4 text-xs text-[#64748B] bg-[#FAFAFA] shrink-0">
          <span className={overLimit ? "text-red-500 font-medium" : ""}>
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars
          </span>
          <span className="text-[#CBD5E1]">·</span>
          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{hashtagCount} hashtag{hashtagCount !== 1 ? "s" : ""}</span>
          {images.length > 0 && (
            <>
              <span className="text-[#CBD5E1]">·</span>
              <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{images.length} image{images.length !== 1 ? "s" : ""}</span>
            </>
          )}
          <span className="text-[#CBD5E1]">·</span>
          {issues.length === 0 ? (
            <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> clean</span>
          ) : (
            <button onClick={() => jumpToLine(issues[0].line)} className="flex items-center gap-1 hover:underline text-[#F97316]">
              <AlertTriangle className="w-3.5 h-3.5" /> {issues.length} note{issues.length !== 1 ? "s" : ""} — jump to first
            </button>
          )}
          {overLimit && <span className="text-red-500">· over the 3,000-char limit</span>}
          <span className="ml-auto text-[10px] text-[#CBD5E1] truncate hidden md:block">
            {localMode ? articlesPath : "editor-only · nothing saved"}
          </span>
        </div>
      </div>

      {showGuide && <Guide onClose={() => setShowGuide(false)} />}
    </TooltipProvider>
  );
}
