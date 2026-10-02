"use client";

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Group, GroupDetail, Klass, Note } from "@/lib/types";
import { flagReasons } from "./Gallery";

export function GroupsView({ klass }: { klass: Klass }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Group[]>(`/groups?class_id=${klass.id}`).then(setGroups).catch((e) => setMsg(e.message));
  }, [klass.id]);
  useEffect(load, [load]);

  async function auto() {
    setBusy(true);
    setMsg(null);
    try {
      const touched = await api<Group[]>("/groups/auto", { method: "POST", json: { class_id: klass.id } });
      setMsg(touched.length ? `${touched.length}개 묶음을 만들거나 갱신했습니다.` : "새로 묶을 사진이 없습니다 (분석이 끝난 사진만 묶습니다).");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  if (openId !== null) return <GroupDetailView groupId={openId} klass={klass} onBack={() => (setOpenId(null), load())} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={auto}>
          {busy ? "묶는 중…" : "날짜·활동별 자동 묶기"}
        </button>
        <span className="text-sm text-ink-2">같은 날, 같은 활동 사진을 하나로 묶습니다. 이미 묶인 사진은 그대로 둡니다.</span>
      </div>
      {msg && <p className="text-sm text-ink-2">{msg}</p>}
      {groups?.length === 0 && <p className="py-10 text-center text-sm text-ink-3">아직 묶음이 없습니다.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups?.map((g) => (
          <li key={g.id}>
            <button className="card flex w-full gap-3 overflow-hidden p-3 text-left transition hover:border-brand" onClick={() => setOpenId(g.id)}>
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper">
                {g.cover_thumb_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.cover_thumb_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{g.title}</div>
                <div className="mt-1 text-sm text-ink-2">
                  {g.date} · {g.photo_count}장
                </div>
                {g.activity && <span className="chip mt-1 border-brand/30 bg-brand-soft text-brand-ink">{g.activity}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupDetailView({ groupId, klass, onBack }: { groupId: number; klass: Klass; onBack: () => void }) {
  const [g, setG] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [tone, setTone] = useState<"warm" | "concise">("warm");
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [template, setTemplate] = useState("grid4");
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<GroupDetail>(`/groups/${groupId}`)
      .then((d) => {
        setG(d);
        setNote((n) => n ?? d.notes[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, [groupId]);
  useEffect(load, [load]);

  async function patch(body: object) {
    try {
      setG(await api<GroupDetail>(`/groups/${groupId}`, { method: "PATCH", json: body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const n = await api<Note>(`/groups/${groupId}/note`, { method: "POST", json: { memo, tone, kind: "notice" } });
      setNote(n);
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setGenerating(false);
    }
  }

  async function saveNote() {
    if (!note) return;
    try {
      const n = await api<Note>(`/notes/${note.id}`, { method: "PATCH", json: { title: note.title, body: note.body } });
      setNote({ ...n, warnings: note.warnings });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }

  async function exportAlbum() {
    setExporting(true);
    try {
      const r = await api<{ url: string }>(`/groups/${groupId}/export`, { method: "POST", json: { template_id: template } });
      setExportUrl(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setExporting(false);
    }
  }

  if (!g) return <p className="text-sm text-ink-3">{error ?? "불러오는 중…"}</p>;

  const childName = new Map(klass.children.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} />
          묶음 목록
        </button>
        <input
          className="input max-w-sm font-semibold"
          defaultValue={g.title}
          onBlur={(e) => e.target.value !== g.title && patch({ title: e.target.value })}
          aria-label="묶음 제목"
        />
        <span className="text-sm text-ink-2">
          {g.date} · {g.photos.length}장
        </span>
        <button
          className="btn-danger ml-auto"
          onClick={async () => {
            if (!confirm("이 묶음을 지울까요? 사진은 지워지지 않습니다.")) return;
            await api(`/groups/${groupId}`, { method: "DELETE" });
            onBack();
          }}
        >
          묶음 삭제
        </button>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {g.photos.map((p) => {
          const isCover = p.id === g.cover_photo_id;
          const reasons = flagReasons(p);
          return (
            <li key={p.id} className={`card relative overflow-hidden ${isCover ? "ring-2 ring-brand" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb_url && <img src={p.thumb_url} alt={p.caption} className="aspect-square w-full object-cover" />}
              {isCover && <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[11px] font-medium text-ink">대표</span>}
              {reasons.length > 0 && <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-warn-soft px-1 text-[11px] text-warn"><TriangleAlert size={11} strokeWidth={2.5} />{reasons[0]}</span>}
              <div className="truncate px-1.5 pt-1 text-[11px] text-ink-2">{p.child_ids.map((id) => childName.get(id)).join(", ") || " "}</div>
              <div className="flex text-[11px]">
                {!isCover && (
                  <button className="flex-1 py-1 text-ink-2 hover:text-brand-ink" onClick={() => patch({ cover_photo_id: p.id })}>
                    대표로
                  </button>
                )}
                <button className="flex-1 py-1 text-ink-3 hover:text-bad" onClick={() => patch({ remove_photo_ids: [p.id] })}>
                  빼기
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">학부모 안내 문구 초안</h2>
          <div>
            <label className="label">활동 메모 (오늘 한 일, 특이사항)</label>
            <textarea
              className="input h-28"
              placeholder="예: 가을 숲 산책. 낙엽 모아 왕관 만들기. 간식은 고구마."
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-ink-3">아이 이름은 초안에 자동으로 넣지 않습니다. 필요하면 보내기 전에 직접 넣어 주세요.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <select className="input w-auto" value={tone} onChange={(e) => setTone(e.target.value as "warm" | "concise")}>
              <option value="warm">따뜻한 말투</option>
              <option value="concise">간결한 말투</option>
            </select>
            <button className="btn-primary" onClick={generate} disabled={generating}>
              {generating ? "작성 중…" : "초안 만들기"}
            </button>
          </div>
          <p className="text-xs text-ink-3">영상 자막은 ‘영상 만들기’ 탭에서 클립을 넣은 뒤 만들고 고칠 수 있어요.</p>
        </section>

        <section className="card space-y-3 p-5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">초안 확인·수정</h2>
            {note?.edited_by_teacher && <span className="chip border-ok/30 text-ok">교사 수정됨</span>}
          </div>
          {!note && <p className="text-sm text-ink-3">왼쪽에서 초안을 만들어 주세요.</p>}
          {note && (
            <>
              {note.warnings.map((w) => (
                <p key={w} className="flex items-start gap-1.5 rounded-lg bg-warn-soft p-2 text-xs text-warn">
                  <TriangleAlert size={14} className="mt-px shrink-0" />
                  {w}
                </p>
              ))}
              <input className="input font-semibold" value={note.title} onChange={(e) => (setNote({ ...note, title: e.target.value }), setSaved(false))} aria-label="제목" />
              <textarea className="input h-32" value={note.body} onChange={(e) => (setNote({ ...note, body: e.target.value }), setSaved(false))} aria-label="본문" />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={saveNote}>
                  {saved ? "저장됨" : "수정 저장"}
                </button>
                <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(`${note.title}\n\n${note.body}`)}>
                  문구 복사
                </button>
              </div>
              {g.notes.length > 1 && (
                <details className="text-xs text-ink-2">
                  <summary className="cursor-pointer">이전 초안 {g.notes.length - 1}개</summary>
                  <ul className="mt-2 space-y-1">
                    {g.notes.slice(1).map((n) => (
                      <li key={n.id}>
                        <button className="underline" onClick={() => setNote(n)}>
                          {new Date(n.created_at).toLocaleString("ko-KR")} · {n.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      </div>

      <section className="card flex flex-wrap items-center gap-3 p-5">
        <h2 className="font-semibold">앨범 이미지</h2>
        <select className="input w-auto" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="grid4">4장 (2×2)</option>
          <option value="grid6">6장 (3×2)</option>
          <option value="grid9">9장 (3×3)</option>
        </select>
        <button className="btn-primary" onClick={exportAlbum} disabled={exporting}>
          {exporting ? "만드는 중…" : "만들기"}
        </button>
        <span className="text-xs text-ink-3">대표 사진과 품질 점수가 높은 사진 순으로 채웁니다 (중복 제외).</span>
        {exportUrl && (
          <div className="w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={exportUrl} alt="앨범 미리보기" className="max-h-96 rounded-lg border border-line" />
            <a href={exportUrl} download={`${g.title}.jpg`} className="btn-ghost mt-2">
              내려받기
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
