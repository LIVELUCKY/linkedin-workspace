import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import ConsentBanner from "@/components/ConsentBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const BASE = process.env.NEXT_PUBLIC_BASE_PATH
  ? `https://livelucky.github.io${process.env.NEXT_PUBLIC_BASE_PATH}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: "LinkedIn Workspace — Markdown to LinkedIn",
  description:
    "Convert Markdown into LinkedIn-ready text. Unicode bold, italic and mono, faithful post preview with see-more fold, character count, and inline formatting warnings.",
  openGraph: {
    title: "LinkedIn Workspace",
    description:
      "Convert Markdown into LinkedIn-ready text. Unicode bold, italic and mono, faithful post preview with see-more fold, character count, and inline formatting warnings.",
    url: BASE,
    siteName: "LinkedIn Workspace",
    images: [{ url: "/og.svg", width: 1200, height: 630, alt: "LinkedIn Workspace" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkedIn Workspace",
    description:
      "Convert Markdown into LinkedIn-ready text. Unicode bold, italic and mono, faithful post preview with see-more fold, character count, and inline formatting warnings.",
    images: ["/og.svg"],
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ height: "100dvh", overflow: "hidden", margin: 0 }}>
        {children}
        <ConsentBanner />
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
