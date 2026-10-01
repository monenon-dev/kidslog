import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // 브라우저는 같은 출처의 /api 로만 호출하고, Next가 FastAPI로 넘긴다 (refresh 쿠키를 같은 출처로 유지)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
