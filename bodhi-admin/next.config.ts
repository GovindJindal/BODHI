import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Ensure that links work correctly in subdirectories if needed
  // trailingSlash: true,
};

export default nextConfig;
