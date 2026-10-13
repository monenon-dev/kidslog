import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const DEMO = process.env.NEXT_PUBLIC_DEMO === "true";

const nextConfig: NextConfig = {
  // 데모 모드에는 로그인·회원가입이 없다 (고정 사용자로 바로 시작)
  async redirects() {
    if (!DEMO) return [];
    return ["/login", "/signup"].map((source) => ({ source, destination: "/classes", permanent: false }));
  },
  // 브라우저는 같은 출처의 /api 로만 호출하고, Next가 FastAPI로 넘긴다 (refresh 쿠키를 같은 출처로 유지)
  // 데모 모드는 백엔드가 없으므로 넘기지 않는다 (API_URL 불필요, 요청은 lib/demo/handlers 가 처리)
  async rewrites() {
    if (DEMO) return [];
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
