import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep a visited/prefetched page's RSC payload in the client Router Cache
    // briefly, so Back and quick re-visits between subpages are instant instead
    // of re-rendering against the database every time. Short windows keep data
    // fresh (LiveRefresh polls every 60s and mutations bust the cache tags).
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
