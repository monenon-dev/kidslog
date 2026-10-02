"use client";

import { CalendarDays, CircleUserRound, Clapperboard, Images, KeyRound, LogOut, Settings, UserRound, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppHeader, RequireAuth } from "@/components/AppHeader";
import { useAuth } from "@/components/AuthProvider";
import { SETTINGS_SECTIONS, SettingsPanel, type SettingsSection } from "@/components/SettingsPanel";
import { api } from "@/lib/api";
import { forgetPrefs } from "@/lib/prefs";
import type { User } from "@/lib/types";

type Stats = { class_count: number; photo_count: number; child_count: number; video_count: number; created_at: string };

function ProfilePanel() {
  const { user, updateUser } = useAuth();
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
    <div className="space-y-6">
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
      <div className="card flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className="mr-1 font-medium text-ink-2">바로 가기</span>
        <Link href="/classes" className="btn-ghost py-1.5">
          <Users size={15} /> 내 반
        </Link>
        <Link href="/video" className="btn-ghost py-1.5">
          <Clapperboard size={15} /> 반 없이 영상만 만들기
        </Link>
      </div>
    </div>
  );
}

type Tab = "profile" | SettingsSection;

function Account() {
  const { logout } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const q = search.get("tab");
  const tab: Tab = q === "profile" || SETTINGS_SECTIONS.some((x) => x.id === q) ? (q as Tab) : "profile";
  const go = (t: Tab) => router.replace(`/profile?tab=${t}`, { scroll: false });

  const item = (t: Tab, label: string, Icon?: LucideIcon) => (
    <button
      key={t}
      type="button"
      onClick={() => go(t)}
      aria-current={tab === t ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors lg:w-full ${
        tab === t ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "text-ink-2 hover:bg-card/70 hover:text-ink"
      }`}
    >
      {Icon && <Icon size={16} className={tab === t ? "text-brand" : "text-ink-3"} />}
      {label}
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="프로필과 설정" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
          {item("profile", "프로필", CircleUserRound)}
          <div className="hidden px-3 pb-1 pt-4 text-xs font-semibold text-ink-3 lg:flex lg:items-center lg:gap-1.5">
            <Settings size={13} /> 설정
          </div>
          <span className="mx-1 w-px shrink-0 self-stretch bg-line lg:hidden" aria-hidden />
          {SETTINGS_SECTIONS.map((x) => item(x.id, x.label))}
          <div className="hidden border-t border-line pt-3 lg:mt-4 lg:block">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-card/70 hover:text-ink"
              onClick={async () => {
                await logout();
                forgetPrefs();
                window.location.replace("/");
              }}
            >
              <LogOut size={16} className="text-ink-3" /> 로그아웃
            </button>
          </div>
        </nav>
        <div className="min-w-0">{tab === "profile" ? <ProfilePanel /> : <SettingsPanel section={tab} />}</div>
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-col">
        <AppHeader>내 프로필</AppHeader>
        <Suspense>
          <Account />
        </Suspense>
      </div>
    </RequireAuth>
  );
}
