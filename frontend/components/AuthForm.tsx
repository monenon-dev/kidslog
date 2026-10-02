"use client";

import { Film } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { FilmFrames } from "./FilmFrames";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { user, login, signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/classes");
  }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-brand-soft via-paper to-accent-soft">
      <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-12 md:min-h-screen md:grid-cols-2 md:py-16">
        <div className="hidden md:block">
          <FilmFrames />
          <p className="mt-8 max-w-sm break-keep text-lg font-medium leading-relaxed text-ink">
            오늘 아이들의 활동 순간,
            <br />
            정리는 짧게 기록은 오래.
          </p>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-ink shadow-sm">
              <Film size={26} strokeWidth={2} />
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">KidsLog</h1>
          </div>
          <p className="mt-3 break-keep text-sm text-ink-2">찍은 사진·영상을 정리하고, 학부모에게 보낼 영상과 문구를 빠르게.</p>
          <form onSubmit={submit} className="card mt-8 space-y-4 p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            <h2 className="text-lg font-semibold">{mode === "login" ? "로그인" : "회원가입"}</h2>
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="name">이름</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">이메일</label>
              <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="pw">비밀번호{mode === "signup" && " (8자 이상)"}</label>
              <input
                id="pw"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            {error && <p className="text-sm text-bad">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "잠시만요…" : mode === "login" ? "로그인" : "가입하기"}
            </button>
            <p className="text-center text-sm text-ink-2">
              {mode === "login" ? (
                <>처음이신가요? <Link className="text-brand-ink underline" href="/signup">회원가입</Link></>
              ) : (
                <>이미 계정이 있나요? <Link className="text-brand-ink underline" href="/login">로그인</Link></>
              )}
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
