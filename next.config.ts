import type { NextConfig } from "next";

// BUILD_TARGET=capacitor produces the static bundle the iOS shell loads from
// disk; the default build keeps API routes and middleware for Vercel.
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

// Hardening headers for the hosted web app. output:"export" (the Capacitor
// build) ignores headers(), so these apply only to the Vercel deployment.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = isCapacitor
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {
      poweredByHeader: false,
      async headers() {
        return [{ source: "/(.*)", headers: securityHeaders }];
      },
    };

export default nextConfig;
