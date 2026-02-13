import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip static generation - this is a dynamic dashboard
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
