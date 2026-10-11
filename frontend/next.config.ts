import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return ["/login", "/register"].map((source) => ({
      source,
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      ],
    }));
  },
  async redirects() {
    return [
      {
        source: "/reset-password",
        destination: "/login?mode=reset-password",
        permanent: false,
      },
    ];
  },
  reactCompiler: true,
};

export default nextConfig;
