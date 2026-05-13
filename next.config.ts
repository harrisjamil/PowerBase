import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Native addon + optional deps; do not bundle ssh2 for API routes. */
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
