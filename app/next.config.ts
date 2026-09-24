import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the dev-mode demo recordings (`?demoSuccess=auto`) free of the Next.js badge.
  devIndicators: false,
};

export default nextConfig;
