import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_EXPORT ? "export" : undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  images: { unoptimized: true },
};

export default nextConfig;
