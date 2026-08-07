import type { NextConfig } from "next";

const supabaseOrigin = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "https://ymayqjphgwvxekgxxolt.supabase.co",
).origin;
const supabaseWebsocketOrigin = supabaseOrigin.replace(/^http/, "ws");

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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https:",
              `connect-src 'self' ${supabaseOrigin} ${supabaseWebsocketOrigin}`,
              "font-src 'self' data:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
