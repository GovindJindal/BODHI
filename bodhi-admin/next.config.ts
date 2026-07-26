import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: 'https://l6927740gk.execute-api.ap-southeast-1.amazonaws.com/admin-v2/:path*',
      },
    ];
  },
};

export default nextConfig;
