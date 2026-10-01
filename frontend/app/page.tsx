"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? "/classes" : "/login");
  }, [user, loading, router]);
  return <div className="p-10 text-center text-sm text-ink-3">불러오는 중…</div>;
}
