import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Publishing and subscribing a report can take up to two minutes, longer than
  // the proxy would otherwise wait.
  experimental: { proxyTimeout: 135_000 },
  // The backend has no CORS headers, so the browser calls it through this proxy.
  async rewrites() {
    return [
      {
        source: "/api/report/:path*",
        destination: "http://localhost:8000/report/:path*",
      },
      {
        source: "/api/ritm/:number",
        destination: "http://localhost:8000/ritm/:number",
      },
      {
        source: "/api/sql/:path*",
        destination: "http://localhost:8000/sql/:path*",
      },
    ];
  },
};

export default nextConfig;
