"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/classes" className="text-lg font-bold text-brand">
          KidsLog
        </Link>
        <div className="min-w-0 flex-1 truncate text-sm text-ink-2">{children}</div>
        {user && (
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-ink-2 sm:inline">{user.name} 선생님</span>
            <button
              className="btn-ghost"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/** 로그인 필요 페이지 감싸기 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  if (loading || !user) return <div className="p-10 text-center text-sm text-ink-3">불러오는 중…</div>;
  return <>{children}</>;
}
