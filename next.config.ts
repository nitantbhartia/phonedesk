import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["twilio"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("twilio");
    }
    return config;
  },
};

export default nextConfig;
