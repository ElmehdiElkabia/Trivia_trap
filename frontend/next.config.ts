import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: false,
  },
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://trivia-trap-api-3fe6377c53b3.herokuapp.com/:path*",
      },
    ];
  },
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
  // Temporarily disable the React Compiler to investigate production hydration error #418.
  reactCompiler: false,
};

export default nextConfig;
