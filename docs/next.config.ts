import path from "node:path";
import type { NextConfig } from "next";

const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const basePath = process.env.BASE_PATH || (isCI ? "/lumi-addons" : "");

const nextConfig: NextConfig = {
  output: "export",
  distDir: "dist",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(import.meta.dirname, "../../"),
  },
};

export default nextConfig;
