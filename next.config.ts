import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray package-lock.json in a parent dir doesn't
  // confuse Turbopack's root inference.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
