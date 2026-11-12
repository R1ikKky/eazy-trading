import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(__dirname, "../.env"), quiet: true });
const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, ".."),
  experimental: {
    proxyClientMaxBodySize: "21mb",
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:3001"}/api/:path*`,
      },
    ];
  },
};
export default config;
