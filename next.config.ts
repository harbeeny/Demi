import type { NextConfig } from "next";

// BUILD_TARGET=capacitor produces the static bundle the iOS shell loads from
// disk; the default build keeps API routes and middleware for Vercel.
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

const nextConfig: NextConfig = isCapacitor
  ? {
      output: "export",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
