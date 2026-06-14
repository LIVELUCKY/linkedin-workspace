# LinkedIn Workspace

**Live:** https://livelucky.github.io/linkedin-workspace/

Draft posts in Markdown and get them LinkedIn-ready. LinkedIn strips all real
formatting, so this converts your Markdown into the Unicode glyph tricks and
plain-text conventions LinkedIn actually renders — with a faithful post preview.

## What it does

- **Copy for LinkedIn** — converts and copies plain text ready to paste into the
  composer: `**bold**` → 𝗯𝗼𝗹𝗱, `*italic*` → 𝘪𝘵𝘢𝘭𝘪𝘤, `` `code` `` → 𝚖𝚘𝚗𝚘,
  headings → bold lines, `-` → `•`, `[text](url)` → `text (url)`.
- **Faithful preview** — a real LinkedIn post card showing the converted text,
  the "…see more" fold (~210 chars), and hashtags/links in LinkedIn blue.
- **Limits at a glance** — live character count against the 3,000 limit and hashtag count.
- **Inline checker** — flags what won't carry over (images, tables) and what gets
  transformed (headings, code blocks), right next to the line.
- **Format** — runs Prettier on the Markdown source, client-side.
- **Two modes** — point at a folder of `.linkedin.md` posts, or paste a draft
  directly into the editor (nothing stored).

> **Note:** folder integration requires running locally. The hosted version works
> in paste-and-edit mode only.

## Run locally

```bash
npm install
PORT=3132 npm run dev
```

## Posts folder structure (local mode)

```
posts/
  my-take/
    my-take.linkedin.md
```

## Stack

Next.js 15 (App Router) · React 19 · Tailwind v4 · Prettier · sonner
