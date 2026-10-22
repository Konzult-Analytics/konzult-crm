import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Vercel preview deployments inject their feedback toolbar from vercel.live.
const isPreview = process.env.VERCEL_ENV === "preview";
const vercelLive = isPreview ? " https://vercel.live" : "";

// Every Supabase call is made server-side, so the browser only ever talks to
// this origin. Next's streamed RSC payload is inline, hence 'unsafe-inline'
// for scripts; the directives that matter most are framing, form, base and
// object restrictions.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${vercelLive}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}${vercelLive}`,
  `frame-src 'self'${vercelLive}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The dev machine's disk is nearly full; Turbopack's persistent dev cache
  // (~300 MB) has filled it mid-request before. Remove when space allows.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // HSTS is sent by Vercel. Once live, these must not be removed without a
  // security review.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
