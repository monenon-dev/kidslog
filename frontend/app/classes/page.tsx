"use client";

import { Clapperboard, FolderPlus, ImageUp, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader, RequireAuth } from "@/components/AppHeader";
import { FilmFrames } from "@/components/FilmFrames";
import { TipCard } from "@/components/TipCard";
import { api } from "@/lib/api";
import type { Klass } from "@/lib/types";

function ClassList() {
  const [classes, setClasses] = useState<Klass[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Klass[]>("/classes").then(setClasses).catch((e) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const k = await api<Klass>("/classes", { method: "POST", json: { name } });
      setClasses((cs) => [...(cs ?? []), k]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10 sm:pt-16">
      <div className="grid gap-8 rounded-2xl bg-card p-6 sm:p-10 lg:grid-cols-[1fr_380px] lg:gap-12">
        <section className="min-w-0">
          <h1 className="text-2xl font-bold">내 반</h1>
          <p className="mt-1 break-keep text-sm text-ink-2">반을 만들고 사진을 올리면 AI가 활동별로 정리해드려요.</p>
          <form onSubmit={create} className="mt-6 flex max-w-xl gap-2">
            <input className="input" placeholder="반 이름 (예: 햇살반, 초급부)" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            <button className="btn-primary shrink-0">반 만들기</button>
          </form>
          {error && <p className="mt-2 text-sm text-bad">{error}</p>}
          <Link
            href="/video"
            className="mt-6 flex max-w-xl items-center gap-4 rounded-xl border border-dashed border-brand/50 bg-brand-soft/40 p-4 transition-colors hover:border-brand hover:bg-brand-soft/70"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-brand">
              <Clapperboard size={19} />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">반 없이 영상만 만들기</div>
              <div className="break-keep text-sm text-ink-2">명단·사진 정리 없이 클립만 넣어 자막과 음악을 얹어요.</div>
            </div>
          </Link>
          {classes?.length !== 0 && (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {classes === null && <li className="text-sm text-ink-3">불러오는 중…</li>}
              {classes?.map((k) => {
                const empty = k.photo_count === 0 && k.children.length === 0;
                return (
                  <li key={k.id}>
                    <Link
                      href={`/classes/${k.id}`}
                      className="card flex items-center gap-4 p-5 transition-[border-color,box-shadow] duration-200 hover:border-brand hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                        <Users size={20} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xl font-semibold">{k.name}</div>
                        {empty ? (
                          <div className="mt-0.5 text-sm text-ink-3">아직 사진이 없어요</div>
                        ) : (
                          <div className="mt-0.5 text-sm text-ink-2">
                            사진 {k.photo_count}장 · 아이 {k.children.length}명
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-5 rounded-xl bg-gradient-to-br from-brand-soft via-paper to-accent-soft p-6">
          <FilmFrames className="mx-auto w-full max-w-[260px]" />
          <TipCard
            tone="plain"
            title="시작하는 방법"
            numbered
            items={[
              { icon: FolderPlus, text: "반 만들기: 반 이름을 입력해 바로 만들어요" },
              { icon: ImageUp, text: "사진 올리기: 반에 들어가 여러 장을 한 번에 올려요" },
              { icon: Sparkles, text: "AI가 활동별로 묶고 잘 나온 사진을 골라 둔 결과를 확인해요" },
            ]}
          />
        </aside>
      </div>
    </main>
  );
}

export default function ClassesPage() {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <ClassList />
      </div>
    </RequireAuth>
  );
}
