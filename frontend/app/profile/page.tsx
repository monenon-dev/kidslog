"use client";

import { CalendarDays, Clapperboard, Images, KeyRound, LogOut, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader, RequireAuth } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type Stats = { class_count: number; photo_count: number; child_count: number; video_count: number; created_at: string };

function Profile() {
  const { user, updateUser, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api<Stats>("/auth/me/stats").then(setStats).catch(() => {});
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === user?.name) return;
    setSavingName(true);
    setNameMsg(null);
    try {
      const u = await api<User>("/auth/me", { method: "PATCH", json: { name: name.trim() } });
      updateUser(u);
      setName(u.name);
      setNameMsg({ ok: true, text: "이름을 바꿨어요." });
    } catch (err) {
      setNameMsg({ ok: false, text: err instanceof Error ? err.message : "저장하지 못했어요" });
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next.length < 8) return setPwMsg({ ok: false, text: "새 비밀번호는 8자 이상이어야 해요." });
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: "새 비밀번호 두 칸이 서로 달라요." });
    setSavingPw(true);
    try {
      await api("/auth/password", { method: "POST", json: { current_password: pw.current, new_password: pw.next } });
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ ok: true, text: "비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요." });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "바꾸지 못했어요" });
    } finally {
      setSavingPw(false);
    }
  }

  if (!user) return null;
  const items = [
    { icon: Users, label: "반", value: stats?.class_count },
    { icon: UserRound, label: "등록한 아이", value: stats?.child_count },
    { icon: Images, label: "사진", value: stats?.photo_count },
    { icon: Clapperboard, label: "반에서 만든 영상", value: stats?.video_count },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="card flex flex-wrap items-center gap-5 p-6 sm:p-8">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xl font-bold text-brand-ink">
              {user.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold">{user.name} 선생님</h1>
              <p className="truncate text-sm text-ink-2">{user.email}</p>
              {stats && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3">
                  <CalendarDays size={12} />
                  {new Date(stats.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 가입
                </p>
              )}
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map(({ icon: Icon, label, value }) => (
              <li key={label} className="card p-4">
                <Icon size={18} className="text-brand" />
                <div className="mt-2 text-2xl font-bold tabular-nums">{value ?? "–"}</div>
                <div className="text-xs text-ink-2">{label}</div>
              </li>
            ))}
          </ul>

          <form onSubmit={saveName} className="card space-y-3 p-6">
            <h2 className="font-semibold">기본 정보</h2>
            <div>
              <label className="label" htmlFor="pf-name">
                이름 (화면 오른쪽 위에 “○○ 선생님”으로 보여요)
              </label>
              <div className="flex gap-2">
                <input id="pf-name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={savingName || !name.trim() || name.trim() === user.name}>
                  {savingName ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
            <div>
              <span className="label">이메일 (로그인 아이디, 바꿀 수 없어요)</span>
              <div className="input bg-paper text-ink-2">{user.email}</div>
            </div>
            {nameMsg && <p className={`text-sm ${nameMsg.ok ? "text-ok" : "text-bad"}`}>{nameMsg.text}</p>}
          </form>

          <form onSubmit={savePassword} className="card space-y-3 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound size={17} className="text-brand" />
              비밀번호 바꾸기
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["current", "지금 비밀번호", "current-password"],
                  ["next", "새 비밀번호 (8자 이상)", "new-password"],
                  ["confirm", "새 비밀번호 확인", "new-password"],
                ] as const
              ).map(([k, label, ac]) => (
                <div key={k}>
                  <label className="label" htmlFor={`pf-${k}`}>
                    {label}
                  </label>
                  <input
                    id={`pf-${k}`}
                    type="password"
                    className="input"
                    autoComplete={ac}
                    value={pw[k]}
                    onChange={(e) => setPw({ ...pw, [k]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={savingPw || !pw.current || !pw.next || !pw.confirm}>
                {savingPw ? "바꾸는 중…" : "비밀번호 바꾸기"}
              </button>
              {pwMsg && <p className={`text-sm ${pwMsg.ok ? "text-ok" : "text-bad"}`}>{pwMsg.text}</p>}
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="card space-y-2 p-5">
            <h2 className="font-semibold">바로 가기</h2>
            <Link href="/classes" className="flex items-center gap-3 rounded-lg p-2 hover:bg-paper">
              <Users size={18} className="text-brand" />
              <span className="text-sm">내 반</span>
            </Link>
            <Link href="/video" className="flex items-center gap-3 rounded-lg p-2 hover:bg-paper">
              <Clapperboard size={18} className="text-brand" />
              <span className="text-sm">반 없이 영상만 만들기</span>
            </Link>
          </div>
          <div className="card space-y-2 p-5 text-sm text-ink-2">
            <h2 className="font-semibold text-ink">개인정보 안내</h2>
            <p className="break-keep">아이 이름은 사진 태그용으로만 쓰이고 AI에 보내지 않아요.</p>
            <p className="break-keep">영상은 브라우저 안에서만 만들어지고 서버에는 편집 설정만 저장돼요.</p>
          </div>
          <button
            className="btn-ghost w-full"
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </aside>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-col">
        <AppHeader>내 프로필</AppHeader>
        <Profile />
      </div>
    </RequireAuth>
  );
}
