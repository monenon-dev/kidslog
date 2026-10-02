"use client";

import {
  ArrowRight,
  Clapperboard,
  EyeOff,
  Film,
  FolderPlus,
  HardDrive,
  ImageUp,
  Lock,
  PenLine,
  ScanFace,
  Send,
  Sparkles,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { FilmFrames } from "@/components/FilmFrames";

/** 대표 기능: 영상 편집 (넓은 카드) */
const VIDEO_POINTS = [
  "여러 클립을 순서대로 이어 붙이고 길이 정하기",
  "짧은 메모로 클립별 AI 자막 초안 받아 고치기",
  "글꼴 9종, 글자색·효과·위치로 자막 꾸미기, 끌어서 옮기기",
  "배경음악, 썸네일 추천, 편집 설정 자동 저장",
  "반을 만들지 않고 영상만 따로 만들어도 돼요",
];

const FEATURES: { icon: LucideIcon; title: string; desc: string; points: string[] }[] = [
  {
    icon: Users,
    title: "아이별 사진 균형",
    desc: "누구 사진이 적게 찍혔는지 한눈에 보고 다음에 챙겨요.",
    points: ["여러 장에 아이 이름 한 번에 태그", "기간별 아이당 사진 수 비교", "적게 나온 아이 ‘적음’ 표시"],
  },
  {
    icon: Sparkles,
    title: "사진 AI 정리",
    desc: "올리기만 하면 활동별로 묶이고, 잘 나온 사진이 먼저 보여요.",
    points: ["활동 태그 자동 달기", "같은 날·같은 활동끼리 묶음", "흔들림·눈 감음·비슷한 사진 표시"],
  },
  {
    icon: PenLine,
    title: "안내 문구 초안",
    desc: "사진 묶음과 짧은 메모로 학부모님께 보낼 글 초안을 써 드려요.",
    points: ["따뜻한 / 간결한 말투 선택", "고친 내용 그대로 저장", "앨범 이미지(4·6·9장)도 함께"],
  },
];

const PLACES = ["수업", "체육", "예술", "돌봄", "체험 활동"];

const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: FolderPlus, title: "반 만들기", desc: "반 이름만 적으면 바로 시작해요." },
  { icon: ImageUp, title: "사진·영상 올리기", desc: "여러 장을 한 번에 올리면 AI가 정리를 시작해요." },
  { icon: Send, title: "편집해서 보내기", desc: "자막·음악을 넣은 영상과 안내 문구를 만들어 학부모님께 보내요." },
];

const PRIVACY: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: ScanFace, title: "얼굴로 아이를 알아보지 않아요", desc: "아이별 사진 수는 선생님이 단 이름 태그로만 셉니다." },
  { icon: UserX, title: "아이 이름은 AI에 보내지 않아요", desc: "문구에 반 명단의 이름이 들어가면 경고해 드려요." },
  { icon: HardDrive, title: "영상은 선생님 기기에서만", desc: "영상 편집은 브라우저 안에서 처리되고 서버에 올라가지 않아요. 저장되는 건 편집 설정뿐이에요." },
  { icon: EyeOff, title: "AI 분석 전 얼굴 흐리게", desc: "원하면 사진 속 얼굴을 흐리게 한 사본만 AI에 보냅니다." },
  { icon: Lock, title: "사진은 비공개 보관", desc: "잠깐만 열리는 주소로만 볼 수 있어요." },
];

export default function Home() {
  const { user } = useAuth();
  const start = user ? { href: "/classes", label: "내 반으로 가기" } : { href: "/signup", label: "무료로 시작하기" };

  return (
    <div className="min-h-screen bg-paper">
      {/* 상단 바 */}
      <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
              <Film size={17} strokeWidth={2.25} />
            </span>
            KidsLog
          </Link>
          {/* 로고 옆 메뉴: 로고와 간격을 두고 왼쪽에 */}
          <nav className="ml-10 hidden items-center gap-6 text-sm sm:flex">
            <a href="#features" className="text-ink-2 hover:text-ink">
              기능
            </a>
            <a href="#privacy" className="text-ink-2 hover:text-ink">
              개인정보
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/login" className="btn-ghost">
              로그인
            </Link>
            <Link href="/signup" className="btn-primary">
              회원가입
            </Link>
          </div>
        </div>
      </header>

      {/* 첫 화면 */}
      <section className="bg-gradient-to-br from-brand-soft via-paper to-accent-soft">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-brand-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <Clapperboard size={13} /> 아이들의 사진·영상 편집 도우미
            </p>
            <h1 className="mt-5 break-keep text-3xl font-bold leading-tight tracking-tight text-ink sm:text-5xl sm:leading-tight">
              오늘 아이들의 활동 순간,
              <br />
              정리는 짧게 기록은 오래.
            </h1>
            <p className="mt-5 max-w-xl break-keep text-base leading-relaxed text-ink-2 sm:text-lg">
              아이들의 활동 사진과 영상을 올리면 AI가 정리하고, 자막과 음악을 넣은 영상과 학부모님께 보낼 안내 문구까지 한 곳에서 편집해요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={start.href} className="btn-primary px-5 py-2.5 text-base">
                {start.label}
                <ArrowRight size={18} />
              </Link>
              <a href="#features" className="btn-ghost px-5 py-2.5 text-base">
                기능 둘러보기
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 text-ink-3">아이들과 함께하는 곳이라면</span>
              {PLACES.map((p) => (
                <span key={p} className="rounded-full border border-line bg-card/70 px-3 py-1 text-ink-2">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <FilmFrames className="w-full max-w-md drop-shadow-[0_12px_24px_rgba(0,0,0,0.08)]" />
          </div>
        </div>
      </section>

      {/* 기능 */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">찍고 나서 하던 정리와 편집을 줄여요</h2>
        <p className="mx-auto mt-3 max-w-xl break-keep text-center text-ink-2">
          영상 편집, 사진 고르기, 아이별로 챙기기, 안내 문구 쓰기. 활동이 끝난 뒤 따로 하던 일을 한 곳에서 끝냅니다.
        </p>

        {/* 대표 기능: 영상 편집 */}
        <article className="card mt-10 grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[1fr_1.1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-ink">
              <Clapperboard size={13} /> 영상 편집
            </span>
            <h3 className="mt-4 break-keep text-xl font-bold sm:text-2xl">찍은 클립이 학부모님께 보낼 영상으로</h3>
            <p className="mt-2 break-keep text-sm text-ink-2">
              편집은 선생님 브라우저 안에서 처리돼서 아이 영상이 서버로 올라가지 않아요. 편집 설정은 저장돼서 다음에 이어서 고칠 수 있어요.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink">
              {VIDEO_POINTS.map((p) => (
                <li key={p} className="flex gap-2 break-keep">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {/* 편집 화면을 단순화한 그림 */}
          <div aria-hidden className="rounded-xl bg-paper p-4">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-[#7fa7b0] via-[#c9b79a] to-[#e9a95a]">
              <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/45 px-3 py-1.5 text-sm font-bold text-[#FFE066] sm:text-base">
                오늘의 활동을 담았어요
              </div>
              <div className="absolute bottom-[12%] left-1/2 h-9 w-[62%] -translate-x-1/2 rounded border border-dashed border-white/70 sm:h-10" />
            </div>
            <div className="mt-3 flex gap-2">
              {["from-[#9cc3c9] to-[#e8d9b5]", "from-[#f3c77a] to-[#e9a95a]", "from-[#b9c9a3] to-[#7fa7b0]", "from-[#e6d3c0] to-[#c9b79a]"].map((g, i) => (
                <div key={g} className={`relative h-10 flex-1 rounded-md bg-gradient-to-br ${g}`}>
                  <span className="absolute left-1 top-0.5 text-[10px] font-semibold text-white/90">{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {["#FFFFFF", "#FFE066", "#F2A531", "#8EE3C8", "#9AD0F5"].map((c) => (
                <span key={c} className="h-5 w-5 rounded-full border border-line" style={{ background: c }} />
              ))}
              <span className="ml-auto rounded-md bg-brand px-3 py-1 text-xs font-semibold text-ink">영상 만들기</span>
            </div>
          </div>
        </article>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, points }) => (
            <article key={title} className="card p-6 transition-shadow hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon size={22} strokeWidth={2} />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1 break-keep text-sm text-ink-2">{desc}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-ink">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 break-keep">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* 사용 순서 */}
      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">이렇게 써요</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <li key={title} className="relative rounded-2xl bg-paper p-6">
                <span className="text-sm font-bold text-brand-ink">STEP {i + 1}</span>
                <span className="mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-card text-brand shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 break-keep text-sm text-ink-2">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 개인정보 */}
      <section id="privacy" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="break-keep text-2xl font-bold sm:text-3xl">아이 정보는 조심스럽게</h2>
            <p className="mt-3 break-keep text-ink-2">
              아이들의 사진과 영상은 가장 민감한 정보예요. KidsLog는 처음부터 꼭 필요한 만큼만 다루도록 설계했어요.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PRIVACY.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3 rounded-xl border border-line bg-card p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div>
                  <h3 className="break-keep text-sm font-semibold">{title}</h3>
                  <p className="mt-0.5 break-keep text-sm text-ink-2">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 마무리 */}
      <section className="px-4 pb-16 sm:pb-20">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-2xl bg-gradient-to-br from-brand-soft via-paper to-accent-soft px-6 py-12 text-center">
          <h2 className="break-keep text-2xl font-bold sm:text-3xl">오늘 찍은 사진·영상부터 정리해 볼까요?</h2>
          <p className="break-keep text-ink-2">반을 만들고 사진·영상을 올리면 바로 시작돼요.</p>
          <Link href={start.href} className="btn-primary px-6 py-2.5 text-base">
            {start.label}
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-3">© KidsLog · 아이들의 사진·영상을 정리하고 편집합니다</footer>
    </div>
  );
}
