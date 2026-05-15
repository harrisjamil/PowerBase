import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Native addon + optional deps; do not bundle ssh2 for API routes. */
  serverExternalPackages: ["ssh2"],
  async redirects() {
    return [
      {
        source: "/projects/:id",
        destination: "/client/projects/:id",
        permanent: false,
      },
      {
        source: "/projects/:id/:path*",
        destination: "/client/projects/:id/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
