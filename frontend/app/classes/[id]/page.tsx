"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppHeader, RequireAuth } from "@/components/AppHeader";
import { BalanceView } from "@/components/BalanceView";
import { Gallery } from "@/components/Gallery";
import { GroupsView } from "@/components/GroupsView";
import { VideoMaker } from "@/components/VideoMaker";
import { api } from "@/lib/api";
import type { Klass } from "@/lib/types";

const TABS = [
  { id: "balance", label: "아이별 균형" },
  { id: "gallery", label: "사진" },
  { id: "video", label: "영상 만들기" },
  { id: "groups", label: "묶음·문구" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);
  const search = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((t) => t.id === search.get("tab"))?.id ?? "balance") as TabId;
  const [klass, setKlass] = useState<Klass | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api<Klass>(`/classes/${classId}`).then(setKlass).catch((e) => setError(e.message));
  }, [classId]);
  useEffect(reload, [reload]);

  if (error) return <p className="p-10 text-center text-bad">{error}</p>;
  if (!klass) return <p className="p-10 text-center text-sm text-ink-3">불러오는 중…</p>;

  return (
    <>
      <AppHeader>{klass.name}</AppHeader>
      <nav className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => router.replace(`/classes/${classId}?tab=${t.id}`, { scroll: false })}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "gallery" && <Gallery klass={klass} />}
        {tab === "balance" && <BalanceView klass={klass} onChildrenChange={reload} />}
        {tab === "groups" && <GroupsView klass={klass} />}
        {tab === "video" && <VideoMaker klass={klass} />}
      </main>
    </>
  );
}

export default function ClassPage() {
  return (
    <RequireAuth>
      <Suspense>
        <Workspace />
      </Suspense>
    </RequireAuth>
  );
}
