import type { NextConfig } from "next";

const isOss = process.env.OSS_BUILD === "true";

const nextConfig: NextConfig = {
    typedRoutes: true,
    env: {
        OSS_BUILD: isOss ? "true" : "false",
    },
};

export default nextConfig;
