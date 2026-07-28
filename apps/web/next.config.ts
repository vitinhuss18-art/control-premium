import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@control-premium/config",
    "@control-premium/domain",
    "@control-premium/integrations",
    "@control-premium/ui",
  ],
  async rewrites() {
    return [
      // Serve o protótipo direto em /painel (sem iframe), mantendo a URL /painel.
      { source: "/painel", destination: "/prototype.html" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
