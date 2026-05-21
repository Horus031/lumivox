import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ['127.0.0.1', '10.25.34.167', '10.25.35.29', '0.0.0.0', '172.16.99.187']
};

export default nextConfig;
