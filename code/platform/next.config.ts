import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Long-running structures (invoice extraction calls the model ~100s)
    // must not be cut off by the dev rewrite proxy's default timeout.
    proxyTimeout: 300000,
  },
  output: 'export',
  images: {
    unoptimized: true,
    localPatterns: [
      {
        pathname: "/horsecoder-storage/**",
      },
    ],
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }

    return [
      {
        source: "/flowTesting-core/:path*",
        destination: "http://localhost:39910/:path*",
      }
    ];
  },
};

export default nextConfig;
