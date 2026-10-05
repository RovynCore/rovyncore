import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/development-log",
        destination: "/latest-info",
        permanent: true,
      },
      {
        source: "/record",
        destination: "/onchain-record",
        permanent: true,
      },
      {
        source: "/:path*",
        destination: "https://www.rovyncore.com/:path*",
        permanent: true,
        has: [{ type: "host", value: "rovyncore.net" }],
      },
      {
        source: "/:path*",
        destination: "https://www.rovyncore.com/:path*",
        permanent: true,
        has: [{ type: "host", value: "rovyncore.com" }],
      },
    ];
  },
};

export default nextConfig;
