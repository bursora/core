import type { NextConfig } from "next";

const isOss = process.env.OSS_BUILD === "true";

const nextConfig: NextConfig = {
    typedRoutes: true,
    allowedDevOrigins: ["app-bursora.ngrok.app"],
    env: {
        OSS_BUILD: isOss ? "true" : "false",
    },
};

export default nextConfig;
