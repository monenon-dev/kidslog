"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader, RequireAuth } from "@/components/AppHeader";
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold">내 반</h1>
      <form onSubmit={create} className="mt-4 flex gap-2">
        <input className="input" placeholder="반 이름 (예: 햇살반, 초급부)" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <button className="btn-primary shrink-0">반 만들기</button>
      </form>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {classes === null && <li className="text-sm text-ink-3">불러오는 중…</li>}
        {classes?.length === 0 && <li className="text-sm text-ink-3">아직 반이 없습니다. 먼저 반을 만들어 주세요.</li>}
        {classes?.map((k) => (
          <li key={k.id}>
            <Link href={`/classes/${k.id}`} className="card block p-5 transition hover:border-brand">
              <div className="text-lg font-semibold">{k.name}</div>
              <div className="mt-1 text-sm text-ink-2">
                사진 {k.photo_count}장 · 아이 {k.children.length}명
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function ClassesPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <ClassList />
    </RequireAuth>
  );
}
