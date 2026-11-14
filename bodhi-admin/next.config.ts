import type { NextConfig } from "next";

// Static export: the dashboard calls the API Gateway directly (see src/lib/config.ts),
// so no rewrites (they are not supported with `output: 'export'`).
const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
