import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // In development, proxy API calls to the local backend.
  // In production (Railway), the frontend calls the backend directly
  // via NEXT_PUBLIC_API_URL set at build time.
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:8000/api/:path*",
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
