"use client";

import { Check, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Klass, Photo, Tags } from "@/lib/types";

type Props = {
  photo: Photo;
  klass: Klass;
  tags: Tags | null;
  onTagsChange: (t: Tags) => void;
  onChange: (p: Photo) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
};

export function PhotoModal({ photo, klass, tags, onTagsChange, onChange, onDelete, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activity = photo.tags.filter((t) => t.kind === "activity");
  const activeSet = new Set(activity.map((t) => t.tag));
  const others = photo.tags.filter((t) => t.kind !== "activity");

  async function call(fn: () => Promise<Photo | void>) {
    setBusy(true);
    setError(null);
    try {
      const p = await fn();
      if (p) onChange(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  const toggleActivity = (t: string) => {
    // 첫 번째 태그가 대표 활동. 선택한 순서를 유지한다.
    const current = activity.map((x) => x.tag);
    const next = activeSet.has(t) ? current.filter((x) => x !== t) : [...current, t];
    call(() => api<Photo>(`/photos/${photo.id}/tags`, { method: "PUT", json: { activity: next } }));
  };

  const toggleChild = (id: number) => {
    const next = photo.child_ids.includes(id) ? photo.child_ids.filter((x) => x !== id) : [...photo.child_ids, id];
    call(() => api<Photo>(`/photos/${photo.id}/children`, { method: "PUT", json: { child_ids: next } }));
  };

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const name = newTag.trim();
    if (!name) return;
    try {
      onTagsChange(await api<Tags>("/tags", { method: "POST", json: { name } }));
      setNewTag("");
      toggleActivity(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "실패");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6" onClick={onClose}>
      <div className="card flex max-h-full w-full max-w-5xl flex-col overflow-hidden md:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-h-64 flex-1 items-center justify-center bg-ink">
          {photo.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt={photo.caption} className="max-h-[50vh] w-auto object-contain md:max-h-[85vh]" />
          )}
        </div>
        <div className="w-full space-y-4 overflow-y-auto p-5 md:w-96">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-ink-3">
                {photo.date} · {photo.original_filename}
              </div>
              <p className="mt-1 text-sm">{photo.caption || (photo.status === "failed" ? photo.error : "분석 중…")}</p>
              {photo.ai_provider && (
                <p className="mt-1 text-xs text-ink-3">
                  분석: {photo.ai_provider === "mock" ? "모의 분석(API 키 없음)" : "Claude"}
                  {photo.blur_applied && " · 얼굴 흐림 후 전송"}
                </p>
              )}
            </div>
            <button className="rounded-md p-1 text-ink-3 hover:bg-paper hover:text-ink" onClick={onClose} aria-label="닫기">
              <X size={20} />
            </button>
          </div>

          <section>
            <h3 className="label">품질</h3>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="chip border-line">점수 {photo.quality_score ?? "-"}</span>
              <span className="chip border-line">선명도 {photo.sharpness ?? "-"}</span>
              <span className="chip border-line">밝기 {photo.brightness ?? "-"}</span>
              {photo.eyes_closed && <span className="chip border-warn/30 bg-warn-soft text-warn"><TriangleAlert size={12} />눈 감음</span>}
              {photo.duplicate_of !== null && <span className="chip border-warn/30 bg-warn-soft text-warn"><TriangleAlert size={12} />비슷한 사진 있음 (#{photo.duplicate_of})</span>}
            </div>
          </section>

          <section>
            <h3 className="label">활동 태그 (눌러서 수정 · 첫 번째가 대표)</h3>
            <div className="flex flex-wrap gap-1.5">
              {(tags?.all ?? []).map((t) => {
                const tag = activity.find((x) => x.tag === t);
                return (
                  <button
                    key={t}
                    disabled={busy}
                    onClick={() => toggleActivity(t)}
                    className={`chip ${tag ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-ink-2 hover:border-brand"}`}
                    title={tag ? (tag.source === "teacher" ? "교사 확정" : `AI 확신도 ${Math.round(tag.confidence * 100)}%`) : undefined}
                  >
                    {t}
                    {tag?.source === "ai" && <span className="text-[10px] text-ink-3">AI</span>}
                  </button>
                );
              })}
            </div>
            <form onSubmit={addTag} className="mt-2 flex gap-1.5">
              <input className="input py-1" placeholder="새 활동 태그 (다음 분석부터 반영)" value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={30} />
              <button className="btn-ghost shrink-0 py-1">추가</button>
            </form>
          </section>

          {others.length > 0 && (
            <section>
              <h3 className="label">AI가 본 것</h3>
              <div className="flex flex-wrap gap-1.5">
                {others.map((t) => (
                  <span key={t.kind + t.tag} className="chip border-line text-ink-2">
                    {t.tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="label">사진 속 아이 (수동 태그)</h3>
            {klass.children.length === 0 ? (
              <p className="text-xs text-ink-3">‘아이별 균형’ 탭에서 명단을 먼저 등록하세요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {klass.children.map((c) => {
                  const on = photo.child_ids.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      disabled={busy}
                      onClick={() => toggleChild(c.id)}
                      className={`chip ${on ? "border-bar bg-bar text-white" : "border-line text-ink-2 hover:border-bar"}`}
                    >
                      {on && <Check size={12} strokeWidth={3} />}
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {error && <p className="text-sm text-bad">{error}</p>}

          <div className="flex gap-2 border-t border-line pt-4">
            <button
              className="btn-ghost"
              disabled={busy || photo.status === "analyzing" || photo.status === "uploaded"}
              onClick={() => call(() => api<Photo>(`/photos/${photo.id}/reanalyze`, { method: "POST" }))}
            >
              다시 분석
            </button>
            <button
              className="btn-danger ml-auto"
              disabled={busy}
              onClick={() =>
                confirm("이 사진을 삭제할까요?") &&
                call(async () => {
                  await api(`/photos/${photo.id}`, { method: "DELETE" });
                  onDelete(photo.id);
                })
              }
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
