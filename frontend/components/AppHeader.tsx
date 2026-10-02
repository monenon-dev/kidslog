"use client";

import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { forgetPrefs } from "@/lib/prefs";
import { useAuth } from "./AuthProvider";
import { NotificationBell } from "./NotificationBell";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-ink" title="KidsLog 소개로">
          KidsLog
        </Link>
        <Link href="/classes" className="text-sm font-medium text-ink-2 hover:text-ink">
          내 반
        </Link>
        <div className="min-w-0 flex-1 truncate text-sm text-ink-2">{children}</div>
        {user && (
          <div className="flex items-center gap-1 text-sm sm:gap-2">
            <NotificationBell />
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-ink-2 transition-colors hover:bg-paper hover:text-ink"
              title="내 프로필·설정"
            >
              <CircleUserRound size={18} />
              <span className="hidden sm:inline">{user.name} 선생님</span>
            </Link>
            <button
              className="btn-ghost"
              onClick={async () => {
                await logout();
                forgetPrefs();
                router.replace("/");
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
