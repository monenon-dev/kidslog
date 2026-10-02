"use client";

import { useEffect, useRef, useState } from "react";
import { api, putToStorage } from "@/lib/api";
import { loadPrefs } from "@/lib/prefs";

type Item = { file: File; photoId?: number; uploadUrl?: string; state: "waiting" | "uploading" | "done" | "error"; error?: string };

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const CONCURRENCY = 4;
const BATCH = 50;

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export function Uploader({ classId, onQueued }: { classId: number; onQueued: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [blur, setBlur] = useState(false);
  useEffect(() => void loadPrefs().then((p) => setBlur(p.blur_faces_default)), []);
  const [error, setError] = useState<string | null>(null);

  const update = (target: Item, patch: Partial<Item>) => {
    Object.assign(target, patch);
    setItems((xs) => [...xs]);
  };

  async function run(targets: Item[]) {
    setBusy(true);
    setError(null);
    try {
      // 1) 서명 URL 발급 (아직 없는 항목만)
      const need = targets.filter((t) => !t.uploadUrl);
      for (let s = 0; s < need.length; s += BATCH) {
        const chunk = need.slice(s, s + BATCH);
        const res = await api<{ photo_id: number; upload_url: string }[]>("/photos/presign", {
          method: "POST",
          json: { class_id: classId, files: chunk.map((t) => ({ filename: t.file.name, content_type: t.file.type, size: t.file.size })) },
        });
        res.forEach((r, i) => Object.assign(chunk[i], { photoId: r.photo_id, uploadUrl: r.upload_url }));
      }
      // 2) 스토리지로 직접 병렬 업로드
      await pool(targets, CONCURRENCY, async (t) => {
        update(t, { state: "uploading", error: undefined });
        try {
          await putToStorage(t.uploadUrl!, t.file);
          update(t, { state: "done" });
        } catch (e) {
          update(t, { state: "error", error: e instanceof Error ? e.message : "실패" });
        }
      });
      // 3) 완료 알림 → 분석 작업 등록
      const ok = targets.filter((t) => t.state === "done").map((t) => t.photoId!);
      for (let s = 0; s < ok.length; s += BATCH) {
        await api("/photos/complete", { method: "POST", json: { photo_ids: ok.slice(s, s + BATCH), blur_faces: blur } });
      }
      if (ok.length) onQueued();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 중 오류");
    } finally {
      setBusy(false);
    }
  }

  function pick(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const bad = list.filter((f) => !ACCEPT.includes(f.type));
    const fresh: Item[] = list.filter((f) => ACCEPT.includes(f.type)).map((file) => ({ file, state: "waiting" }));
    setItems((xs) => [...xs.filter((x) => x.state !== "done"), ...fresh]);
    if (bad.length) setError(`JPG/PNG/WEBP만 올릴 수 있습니다 (제외: ${bad.length}개)`);
    if (fresh.length) run(fresh);
  }

  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "error");

  return (
    <div
      className="card border-dashed p-5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) pick(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          사진 올리기
        </button>
        <span className="text-sm text-ink-2">여러 장을 한 번에 선택하거나 여기로 끌어다 놓으세요.</span>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} />
          AI 분석 전 얼굴 흐리게
        </label>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          hidden
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full bg-brand transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <span>
              업로드 {done}/{items.length}
              {busy && " · 진행 중…"}
            </span>
            {failed.length > 0 && !busy && (
              <button className="btn-ghost py-1" onClick={() => run(failed)}>
                실패한 {failed.length}장만 다시 올리기
              </button>
            )}
          </div>
          {failed.length > 0 && (
            <ul className="mt-2 max-h-24 overflow-auto text-xs text-bad">
              {failed.map((f, i) => (
                <li key={i}>
                  {f.file.name}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
