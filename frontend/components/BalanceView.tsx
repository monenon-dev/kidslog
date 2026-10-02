"use client";

import { TriangleAlert, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Balance, Klass } from "@/lib/types";
import { EmptyState } from "./EmptyState";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function BalanceView({ klass, onChildrenChange }: { klass: Klass; onChildrenChange: () => void }) {
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [data, setData] = useState<Balance | null>(null);
  const [names, setNames] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    api<Balance>(`/classes/${klass.id}/balance?${p}`).then(setData).catch((e) => setError(e.message));
  }, [klass.id, from, to]);
  useEffect(load, [load, klass.children.length]);

  async function addChildren(e: React.FormEvent) {
    e.preventDefault();
    const list = names.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    try {
      await api(`/classes/${klass.id}/children`, { method: "POST", json: { names: list } });
      setNames("");
      onChildrenChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "실패");
    }
  }

  async function removeChild(id: number, name: string) {
    if (!confirm(`${name}을(를) 명단에서 지울까요? 사진에 단 태그도 함께 지워집니다.`)) return;
    await api(`/classes/${klass.id}/children/${id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    onChildrenChange();
  }

  const max = Math.max(1, ...(data?.rows.map((r) => r.count) ?? [1]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="text-lg font-semibold">아이별 사진 수</h2>
            <p className="text-xs text-ink-2">얼굴 인식 없이, 사진에 직접 단 이름 태그로 셉니다.</p>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="label">시작</label>
              <input type="date" className="input py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">끝</label>
              <input type="date" className="input py-1" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>

        {data && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div>
              <div className="text-2xl font-bold">{data.total_photos}</div>
              <div className="text-xs text-ink-2">기간 내 사진</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{data.average}</div>
              <div className="text-xs text-ink-2">아이당 평균</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${data.untagged_photos ? "text-warn" : ""}`}>{data.untagged_photos}</div>
              <div className="text-xs text-ink-2">아이 태그 없는 사진</div>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-bad">{error}</p>}

        {data && data.rows.length === 0 && (
          <EmptyState className="mt-6" icon={UserPlus} title="아이 명단이 비어 있습니다" description="‘아이 명단’에 이름을 등록하고 사진에 태그하면 아이별 사진 수를 여기서 비교할 수 있습니다." />
        )}

        {data && data.rows.length > 0 && (
          <>
            <ul className="mt-6 space-y-2" aria-label="아이별 사진 수 (적은 순)">
              {data.rows.map((r) => (
                <li key={r.child_id} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${r.name}: ${r.count}장 (평균 ${data.average})`}>
                  <span className="truncate">{r.name}</span>
                  <div className="relative h-5">
                    <div className="h-full rounded-r bg-bar" style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count ? 4 : 0 }} />
                    <div className="absolute inset-y-[-3px] w-px bg-ink-3" style={{ left: `${(data.average / max) * 100}%` }} aria-hidden />
                  </div>
                  <span className="text-right tabular-nums">
                    {r.count}장{r.low && <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-xs font-medium text-warn"><TriangleAlert size={12} strokeWidth={2.5} />적음</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-3">세로선은 평균. 평균의 70% 미만이면 ‘적음’으로 표시합니다.</p>
          </>
        )}
      </section>

      <aside className="card h-fit p-5">
        <h2 className="font-semibold">아이 명단</h2>
        <p className="mt-1 text-xs text-ink-2">이름(또는 별칭)은 사진 태그용으로만 쓰이며 AI에 전송되지 않습니다.</p>
        <form onSubmit={addChildren} className="mt-3 space-y-2">
          <textarea className="input h-24" placeholder={"쉼표나 줄바꿈으로 여러 명\n예: 가온, 나래, 다온"} value={names} onChange={(e) => setNames(e.target.value)} />
          <button className="btn-primary w-full">추가</button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {klass.children.map((c) => (
            <li key={c.id} className="chip border-line">
              {c.name}
              <button className="text-ink-3 hover:text-bad" onClick={() => removeChild(c.id, c.name)} aria-label={`${c.name} 삭제`}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
