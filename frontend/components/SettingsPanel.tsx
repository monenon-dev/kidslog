"use client";

import { Bell, Check, Clapperboard, CloudCheck, CloudOff, HardDrive, ShieldCheck, SlidersHorizontal, TriangleAlert, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ColorPicker } from "@/components/ColorPicker";
import { Segmented } from "@/components/Segmented";
import { Toggle } from "@/components/Toggle";
import { api } from "@/lib/api";
import { DEFAULT_PREFS, forgetPrefs, loadPrefs, savePrefs, type NotifyPrefs, type UserPrefs } from "@/lib/prefs";
import { DEFAULT_SUB_STYLE, FONTS, MUSIC_PRESETS, SUB_COLORS, SUB_EFFECTS, SUB_POSITIONS, SUB_SIZES, subStyleColors } from "@/lib/video";
import { clearAllVideos, storedVideoStats } from "@/lib/videoStore";

const RETENTION = [
  { id: "0", label: "지우지 않음" },
  { id: "30", label: "30일" },
  { id: "90", label: "90일" },
  { id: "180", label: "180일" },
  { id: "365", label: "1년" },
] as const;

const NOTIFY: { key: keyof NotifyPrefs; label: string; desc: string }[] = [
  { key: "analysis", label: "사진 분석 끝남", desc: "올린 사진의 AI 정리가 끝나거나 실패한 사진이 있을 때" },
  { key: "low_photos", label: "사진이 적게 찍힌 아이", desc: "일주일에 한 번, 반마다 평균보다 사진이 적은 아이를 알려요" },
  { key: "ai_limit", label: "AI 하루 한도", desc: "오늘 AI 분석이 한도에 가까워지거나 넘었을 때" },
  { key: "storage", label: "영상 저장 문제", desc: "브라우저 저장 공간이 부족하거나 편집 설정을 저장하지 못했을 때" },
  { key: "retention", label: "보관 기간 정리", desc: "보관 기간이 지난 사진을 지웠을 때" },
];

function Section({ id, icon: Icon, title, desc, children }: { id: string; icon: LucideIcon; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon size={18} className="text-brand" />
          {title}
        </h2>
        {desc && <p className="mt-1 break-keep text-sm text-ink-2">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="break-keep text-xs text-ink-3">{desc}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export type SettingsSection = "privacy" | "video" | "work" | "notify" | "danger";

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "privacy", label: "개인정보·데이터" },
  { id: "video", label: "영상 기본 스타일" },
  { id: "work", label: "작업 기본값" },
  { id: "notify", label: "알림" },
  { id: "danger", label: "계정 삭제" },
];

/** 설정 한 묶음만 보여준다. 값은 한 번 불러와 두고 묶음을 바꿔도 유지된다. */
export function SettingsPanel({ section }: { section: SettingsSection }) {
  const { logout } = useAuth();
  const [p, setP] = useState<UserPrefs | null>(null);
  const [state, setState] = useState<"saving" | "saved" | "error" | null>(null);
  const [stored, setStored] = useState<{ count: number; mb: number } | null>(null);
  const [delPw, setDelPw] = useState("");
  const [delSure, setDelSure] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const lastSaved = useRef<string>("");

  useEffect(() => {
    loadPrefs().then((x) => {
      lastSaved.current = JSON.stringify(x);
      setP(x);
    });
    storedVideoStats().then(setStored);
  }, []);

  // 바꾸면 잠시 뒤 자동 저장
  useEffect(() => {
    if (!p) return;
    const json = JSON.stringify(p);
    if (json === lastSaved.current) return;
    setState("saving");
    const t = setTimeout(() => {
      savePrefs(p)
        .then(() => {
          lastSaved.current = json;
          setState("saved");
        })
        .catch(() => setState("error"));
    }, 500);
    return () => clearTimeout(t);
  }, [p]);

  if (!p) return <p className="p-10 text-center text-sm text-ink-3">불러오는 중…</p>;
  const set = <K extends keyof UserPrefs>(k: K, v: UserPrefs[K]) => setP({ ...p, [k]: v });
  const setVideo = <K extends keyof UserPrefs["video_defaults"]>(k: K, v: UserPrefs["video_defaults"][K]) =>
    setP({ ...p, video_defaults: { ...p.video_defaults, [k]: v } });
  const vd = p.video_defaults;

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!delSure || !delPw) return;
    if (!confirm("정말 계정을 지울까요? 반·사진·명단·문구가 모두 사라지고 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    setDelErr(null);
    try {
      await api("/auth/me", { method: "DELETE", json: { password: delPw } });
      await clearAllVideos();
      forgetPrefs();
      await logout();
      // 로그인 화면으로 튕기지 않게 홈으로 새로 불러온다 (남은 화면 상태도 함께 비움)
      window.location.replace("/");
    } catch (err) {
      setDelErr(err instanceof Error ? err.message : "지우지 못했어요");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">설정</h1>
          <p className="mt-0.5 text-sm text-ink-2">바꾸면 바로 저장돼요.</p>
        </div>
        {state && (
          <span className={`ml-auto inline-flex items-center gap-1 text-sm ${state === "error" ? "text-bad" : "text-ink-2"}`}>
            {state === "error" ? <CloudOff size={15} /> : <CloudCheck size={15} />}
            {state === "saving" ? "저장 중…" : state === "saved" ? "저장됨" : "저장하지 못했어요"}
          </span>
        )}
      </div>

          {section === "privacy" && (
          <Section id="privacy" icon={ShieldCheck} title="개인정보·데이터" desc="아이 사진을 다루는 만큼, 남겨 둘 것과 보낼 것을 직접 정해요.">
            <Row label="사진 보관 기간" desc="지난 사진은 서버에서 원본·썸네일까지 지워요">
              <Segmented
                value={String(p.photo_retention_days) as (typeof RETENTION)[number]["id"]}
                options={RETENTION}
                onChange={(v) => {
                  const days = Number(v) as UserPrefs["photo_retention_days"];
                  if (days && (!p.photo_retention_days || days < p.photo_retention_days) && !confirm(`올린 지 ${days}일이 지난 사진은 바로 지워져요. 계속할까요?`)) return;
                  set("photo_retention_days", days);
                }}
              />
            </Row>
            <div className="space-y-4 border-t border-line pt-4">
              <Toggle
                label="AI 분석 사용"
                description="끄면 사진·문구·자막을 AI에 보내지 않고 간단한 규칙으로만 정리해요. 정확도는 낮아져요."
                checked={p.ai_enabled}
                onChange={(v) => set("ai_enabled", v)}
              />
              <Toggle
                label="업로드할 때 얼굴 흐리게 (기본값)"
                description="사진 올리기 화면에서 ‘AI 분석 전 얼굴 흐리게’가 처음부터 켜져 있어요."
                checked={p.blur_faces_default}
                onChange={(v) => set("blur_faces_default", v)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-paper px-4 py-3">
              <HardDrive size={18} className="text-ink-3" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">이 브라우저에 보관한 영상</div>
                <div className="text-xs text-ink-2">
                  {stored === null ? "확인 중…" : stored.count ? `${stored.count}개 · ${stored.mb.toFixed(1)}MB` : "없음"} · 공용 컴퓨터라면 지워 두세요
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                disabled={!stored?.count}
                onClick={async () => {
                  if (!confirm("이 브라우저에 보관한 영상을 모두 지울까요? 내려받은 파일은 지워지지 않아요.")) return;
                  await clearAllVideos();
                  setStored(await storedVideoStats());
                }}
              >
                모두 지우기
              </button>
            </div>
          </Section>
          )}

          {section === "video" && (
          <Section id="video" icon={Clapperboard} title="영상 기본 스타일" desc="새 영상을 만들 때 이 모양으로 시작해요. 영상 만들기 화면에서 ‘기본값으로 저장’을 눌러도 바뀌어요.">
            <div
              className="flex aspect-[16/5] items-end justify-center rounded-lg bg-gradient-to-br from-[#7fa7b0] via-[#c9b79a] to-[#e9a95a] pb-[4%]"
              aria-hidden
              style={{ alignItems: vd.position === "top" ? "flex-start" : vd.position === "middle" ? "center" : "flex-end", paddingTop: vd.position === "top" ? "4%" : undefined }}
            >
              <span
                className="rounded px-3 py-1 leading-none"
                style={{
                  color: vd.color,
                  fontSize: { s: "1rem", m: "1.3rem", l: "1.65rem" }[vd.size],
                  fontWeight: 700,
                  ...(vd.effect === "box" && { background: "rgba(0,0,0,0.45)" }),
                  ...(vd.effect === "outline" && { WebkitTextStroke: "3px rgba(0,0,0,0.8)", paintOrder: "stroke fill" }),
                  ...(vd.effect === "shadow" && { textShadow: "2px 2px 0 rgba(0,0,0,0.6)" }),
                }}
              >
                오늘의 활동을 담았어요
              </span>
            </div>
            <Row label="글꼴">
              <select className="input" value={vd.font} onChange={(e) => setVideo("font", e.target.value)}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="크기">
              <Segmented value={vd.size} options={SUB_SIZES} onChange={(v) => setVideo("size", v)} />
            </Row>
            <Row label="글자색">
              <div className="flex flex-wrap items-center gap-2">
                {SUB_COLORS.map((c) => {
                  const on = vd.color.toUpperCase() === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setVideo("color", c.hex)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border ${on ? "border-ink ring-2 ring-brand ring-offset-2" : "border-line"}`}
                      style={{ background: c.hex }}
                      aria-label={c.label}
                      aria-pressed={on}
                    >
                      {on && <Check size={13} strokeWidth={3} color={c.hex === "#2B2824" ? "#fff" : "#2b2824"} />}
                    </button>
                  );
                })}
                <ColorPicker value={vd.color} onChange={(hex) => setVideo("color", hex)} iconColor={subStyleColors({ ...DEFAULT_SUB_STYLE, color: vd.color }).dark ? "#fff" : "#2b2824"} />
              </div>
            </Row>
            <Row label="효과">
              <Segmented value={vd.effect} options={SUB_EFFECTS} onChange={(v) => setVideo("effect", v)} />
            </Row>
            <Row label="자막 위치">
              <Segmented value={vd.position} options={SUB_POSITIONS} onChange={(v) => setVideo("position", v)} />
            </Row>
            <Row label="배경음악">
              <Segmented
                value={vd.music}
                options={[{ id: "none", label: "없음" }, ...MUSIC_PRESETS.map((m) => ({ id: m.id, label: m.label.replace(/ \(합성음\)/, "") }))]}
                onChange={(v) => setVideo("music", v)}
              />
            </Row>
            <Row label={`클립당 최대 길이: ${vd.max_sec}초`}>
              <input type="range" min={3} max={60} value={vd.max_sec} onChange={(e) => setVideo("max_sec", Number(e.target.value))} className="w-full" />
            </Row>
            <div className="text-right">
              <button type="button" className="btn-ghost" onClick={() => set("video_defaults", DEFAULT_PREFS.video_defaults)}>
                처음 값으로
              </button>
            </div>
          </Section>
          )}

          {section === "work" && (
          <Section id="work" icon={SlidersHorizontal} title="작업 기본값">
            <Row label="AI 말투" desc="안내 문구·자막 초안의 처음 말투">
              <Segmented
                value={p.ai_tone}
                options={[
                  { id: "warm", label: "따뜻한" },
                  { id: "concise", label: "간결한" },
                ]}
                onChange={(v) => set("ai_tone", v)}
              />
            </Row>
            <Row label="아이별 균형: 보는 기간" desc="균형 탭을 열면 이 기간으로 시작해요">
              <Segmented
                value={String(p.balance_days) as "7" | "14" | "30"}
                options={[
                  { id: "7", label: "1주" },
                  { id: "14", label: "2주" },
                  { id: "30", label: "한 달" },
                ]}
                onChange={(v) => set("balance_days", Number(v) as UserPrefs["balance_days"])}
              />
            </Row>
            <Row label={`‘적음’ 기준: 평균의 ${Math.round(p.balance_ratio * 100)}% 미만`} desc="이보다 적게 찍힌 아이를 ‘적음’으로 표시하고 알려요">
              <input
                type="range"
                min={30}
                max={90}
                step={10}
                value={Math.round(p.balance_ratio * 100)}
                onChange={(e) => set("balance_ratio", Number(e.target.value) / 100)}
                className="w-full"
              />
            </Row>
          </Section>
          )}

          {section === "notify" && (
          <Section id="notify" icon={Bell} title="알림" desc="화면 위 종 아이콘에 쌓여요. 받고 싶지 않은 알림은 꺼 두세요.">
            <div className="space-y-4">
              {NOTIFY.map((n) => (
                <Toggle key={n.key} label={n.label} description={n.desc} checked={p.notify[n.key]} onChange={(v) => set("notify", { ...p.notify, [n.key]: v })} />
              ))}
            </div>
          </Section>
          )}

          {section === "danger" && (
          <section id="danger" className="card scroll-mt-4 space-y-4 border-bad/40 p-6">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-bad">
                <TriangleAlert size={18} />
                계정 삭제
              </h2>
              <p className="mt-1 break-keep text-sm text-ink-2">
                계정과 함께 모든 반·사진(원본·썸네일)·아이 명단·문구·앨범 이미지·영상 기록을 서버에서 지워요. 이 브라우저에 보관한 영상도 지워요. 되돌릴 수 없어요.
              </p>
            </div>
            <form onSubmit={deleteAccount} className="space-y-3">
              <div className="max-w-sm">
                <label className="label" htmlFor="del-pw">
                  비밀번호 확인
                </label>
                <input id="del-pw" type="password" className="input" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
              </div>
              <Toggle size="sm" label="모든 데이터가 지워진다는 것을 이해했어요" checked={delSure} onChange={setDelSure} />
              {delErr && <p className="text-sm text-bad">{delErr}</p>}
              <button className="btn-danger" disabled={!delSure || !delPw || deleting}>
                {deleting ? "지우는 중…" : "계정 삭제"}
              </button>
            </form>
          </section>
          )}
    </div>
  );
}
