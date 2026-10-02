"use client";

import { Check, EyeOff, Images, SearchX, Tag, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Klass, Photo, Tags } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { PhotoModal } from "./PhotoModal";
import { TipCard } from "./TipCard";
import { Uploader } from "./Uploader";

const PAGE = 120;

export function flagReasons(p: Photo): string[] {
  const out: string[] = [];
  if (p.quality_score !== null && p.quality_score < 45) out.push("흐림·노출");
  if (p.eyes_closed) out.push("눈 감음");
  if (p.duplicate_of !== null) out.push("중복");
  return out;
}

export function useTags() {
  const [tags, setTags] = useState<Tags | null>(null);
  const reload = useCallback(() => {
    api<Tags>("/tags").then(setTags).catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  return { tags, setTags, reload };
}

export function Gallery({ klass }: { klass: Klass }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date: "", tag: "", q: "", quality: "", child: "" });
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { tags, setTags } = useTags();
  const limitRef = useRef(PAGE);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ class_id: String(klass.id) });
    if (filters.date) p.set("date", filters.date);
    if (filters.tag) p.set("tag", filters.tag);
    if (filters.q) p.set("q", filters.q);
    if (filters.quality) p.set("quality", filters.quality);
    if (filters.child) p.set("child_id", filters.child);
    return p;
  }, [klass.id, filters]);

  const load = useCallback(
    async (limit = limitRef.current) => {
      limitRef.current = limit;
      try {
        const r = await api<{ items: Photo[]; total: number }>(`/photos?${qs}&limit=${limit}`);
        setPhotos(r.items);
        setTotal(r.total);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    },
    [qs],
  );

  useEffect(() => {
    load(PAGE);
  }, [load]);

  // 분석 중인 사진이 있으면 폴링
  const processing = photos.some((p) => p.status === "uploaded" || p.status === "analyzing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => load(), 2500);
    return () => clearInterval(t);
  }, [processing, load]);

  const replace = (p: Photo) => {
    setPhotos((xs) => xs.map((x) => (x.id === p.id ? p : x)));
    setOpen((o) => (o && o.id === p.id ? p : o));
  };

  async function bulkChild(childId: number, add: boolean) {
    try {
      const res = await api<Photo[]>("/photos/children/bulk", {
        method: "POST",
        json: { photo_ids: [...selected], child_id: childId, add },
      });
      res.forEach(replace);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    }
  }

  async function bulkDelete() {
    if (!confirm(`선택한 ${selected.size}장을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    for (const id of selected) await api(`/photos/${id}`, { method: "DELETE" }).catch(() => {});
    setSelected(new Set());
    load();
  }

  const childName = new Map(klass.children.map((c) => [c.id, c.name]));
  const activityTags = tags?.all ?? [];
  const hasFilter = Object.values(filters).some(Boolean);
  return (
    <div className="space-y-4">
      <Uploader classId={klass.id} onQueued={() => load()} />

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">날짜</label>
          <input type="date" className="input" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </div>
        <div>
          <label className="label">활동</label>
          <select className="input" value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
            <option value="">전체</option>
            {activityTags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">품질</label>
          <select className="input" value={filters.quality} onChange={(e) => setFilters({ ...filters, quality: e.target.value })}>
            <option value="">전체</option>
            <option value="good">잘 나온 사진</option>
            <option value="flagged">확인 필요 (흐림·중복·눈감음)</option>
          </select>
        </div>
        {klass.children.length > 0 && (
          <div>
            <label className="label">아이</label>
            <select className="input" value={filters.child} onChange={(e) => setFilters({ ...filters, child: e.target.value })}>
              <option value="">전체</option>
              {klass.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <form
          className="min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...filters, q: query.trim() });
          }}
        >
          <label className="label">검색 (설명·태그)</label>
          <input className="input" placeholder="예: 모래, 그림, 공" value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
        <button
          className={selecting ? "btn-primary" : "btn-ghost"}
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
          }}
        >
          {selecting ? "선택 끝내기" : "여러 장 선택"}
        </button>
      </div>

      {selecting && (
        <div className="card sticky top-2 z-10 flex flex-wrap items-center gap-2 p-3 text-sm shadow-sm">
          <span className="font-medium">{selected.size}장 선택</span>
          <button className="btn-ghost py-1" onClick={() => setSelected(new Set(photos.map((p) => p.id)))}>
            전체 선택
          </button>
          {selected.size > 0 && (
            <>
              <span className="ml-2 text-ink-2">아이 태그:</span>
              {klass.children.length === 0 && <span className="text-ink-3">‘아이별 균형’ 탭에서 명단을 먼저 등록하세요</span>}
              {klass.children.map((c) => (
                <span key={c.id} className="chip border-line">
                  {c.name}
                  <button className="font-bold text-ok" title={`${c.name} 추가`} onClick={() => bulkChild(c.id, true)}>
                    +
                  </button>
                  <button className="font-bold text-bad" title={`${c.name} 빼기`} onClick={() => bulkChild(c.id, false)}>
                    −
                  </button>
                </span>
              ))}
              <button className="btn-danger ml-auto py-1" onClick={bulkDelete}>
                삭제
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="text-sm text-ink-2">
        {loading ? "불러오는 중…" : `${total}장`}
        {processing && " · AI가 분석 중입니다…"}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {photos.map((p) => {
          const isSel = selected.has(p.id);
          const reasons = flagReasons(p);
          const pending = p.status === "uploaded" || p.status === "analyzing";
          return (
            <li key={p.id}>
              <button
                className={`card group block w-full overflow-hidden text-left transition-[border-color,box-shadow] duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.10)] ${isSel ? "ring-2 ring-brand" : "hover:border-brand"}`}
                onClick={() => {
                  if (selecting) {
                    const s = new Set(selected);
                    if (isSel) s.delete(p.id);
                    else s.add(p.id);
                    setSelected(s);
                  } else setOpen(p);
                }}
              >
                <div className="p-1.5 pb-0">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-paper">
                    {p.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumb_url} alt={p.caption || p.original_filename} className="h-full w-full object-cover" loading="lazy" />
                    ) : p.status === "failed" ? (
                      <div className="flex h-full items-center justify-center text-xs text-ink-3">분석 실패</div>
                    ) : (
                      <div className="h-full w-full bg-line/70 motion-safe:animate-pulse" role="status">
                        <span className="sr-only">분석 중</span>
                      </div>
                    )}
                    {selecting && (
                      <span className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-xs text-white ${isSel ? "bg-brand-ink" : "bg-black/30"}`}>
                        {isSel && <Check size={14} strokeWidth={3} />}
                      </span>
                    )}
                    {reasons.length > 0 && (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
                        <TriangleAlert size={12} strokeWidth={2.5} />
                        {reasons.join("·")}
                      </span>
                    )}
                    {p.quality_score !== null && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white">품질 {Math.round(p.quality_score)}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 p-2">
                  <div className="flex items-center gap-1 text-xs">
                    {p.activity && <span className="chip border-brand/30 bg-brand-soft text-brand-ink">{p.activity}</span>}
                    {pending && !p.activity && <span className="h-5 w-14 rounded-full bg-line/70 motion-safe:animate-pulse" aria-hidden />}
                    {p.status === "failed" && <span className="chip border-bad/30 bg-bad-soft text-bad">실패</span>}
                  </div>
                  <div className="truncate text-xs text-ink-2">
                    {p.child_ids.length ? p.child_ids.map((id) => childName.get(id)).join(", ") : <span className="text-ink-3">아이 태그 없음</span>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {!loading && photos.length === 0 &&
        (hasFilter ? (
          <EmptyState
            icon={SearchX}
            title="조건에 맞는 사진이 없습니다"
            description="날짜·활동·품질 조건이나 검색어를 바꿔 보세요."
            action={{
              label: "조건 초기화",
              onClick: () => {
                setFilters({ date: "", tag: "", q: "", quality: "", child: "" });
                setQuery("");
              },
            }}
          />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
            <EmptyState icon={Images} title="아직 사진이 없습니다" description="위에서 사진을 올리면 AI가 활동별로 태그를 달고 잘 나온 사진을 골라 줍니다." />
            <TipCard
              title="이렇게 활용해보세요"
              items={[
                { icon: Upload, text: "여러 장을 한 번에 끌어다 놓아도 됩니다" },
                { icon: EyeOff, text: "AI 분석 전 얼굴 흐리게 옵션을 쓸 수 있어요" },
                { icon: Tag, text: "사진에 아이 이름을 태그하면 ‘아이별 균형’ 탭에서 통계를 볼 수 있어요" },
              ]}
            />
          </div>
        ))}
      {photos.length < total && (
        <div className="text-center">
          <button className="btn-ghost" onClick={() => load(limitRef.current + PAGE)}>
            더 보기 ({photos.length}/{total})
          </button>
        </div>
      )}

      {open && (
        <PhotoModal
          photo={open}
          klass={klass}
          tags={tags}
          onTagsChange={setTags}
          onChange={replace}
          onDelete={(id) => {
            setPhotos((xs) => xs.filter((x) => x.id !== id));
            setTotal((t) => t - 1);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
