import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip static generation - this is a dynamic dashboard
  output: "standalone",
};

export default nextConfig;
