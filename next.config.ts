import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure client app — no user data ever touches a server. Static export
  // allows hosting on any static host (Vercel/Netlify/nginx).
  output: "export",
};

export default nextConfig;
