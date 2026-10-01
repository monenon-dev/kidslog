"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

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
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold text-brand">KidsLog</h1>
      <p className="mt-1 text-sm text-ink-2">찍은 사진·영상을 정리하고, 학부모에게 보낼 영상과 문구를 빠르게.</p>
      <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
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
            <>처음이신가요? <Link className="text-brand underline" href="/signup">회원가입</Link></>
          ) : (
            <>이미 계정이 있나요? <Link className="text-brand underline" href="/login">로그인</Link></>
          )}
        </p>
      </form>
    </main>
  );
}
